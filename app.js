/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);

const state = {
  songs: [],
  filtered: [],
  selectMode: false,
  selectedIds: [], // 순서대로 저장
};

const SB_SONGS_TABLE = "songs";
const SB_FILES_BUCKET = "score-files";

let previewSession = 0;
let previewDoc = null;
let previewPage = 1;
let previewTotalPages = 1;
let previewMobileSlideMode = false;
let previewSong = null;
let previewPartialSelectMode = false;
let previewSelectedPages = new Set();
let previewEditMode = false;
let previewEditDeletePages = new Set();
let chipDragState = null;
let mobileRowDragState = null;
let mobileTwoFingerScrollY = null;
let scrollIndexDragState = null;
let addUploadInProgress = false;

const KOR_INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];
const SIMPLE_KOR_INITIALS = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const ENG_INDEX = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SCROLL_INDEX_TOKENS = [...SIMPLE_KOR_INITIALS, ...ENG_INDEX];

function getChosung(str = "") {
  // 한글 음절(가-힣)의 초성 추출
  const text = String(str).normalize("NFC");
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / (21 * 28));
      out += KOR_INITIALS[idx] || "";
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}

function normalize(str="") {
  return String(str).normalize("NFC").trim().toLowerCase();
}

function matchesQuery(song, q) {
  if (!q) return true;
  const nq = normalize(q);

  const title = normalize(song.title);
  const artist = normalize(song.artist);
  const key = normalize(song.key);

  const cTitle = getChosung(song.title);
  const cArtist = getChosung(song.artist);

  // 초성 검색: 입력에 한글 자모가 섞여있으면 초성 우선
  const hasJamo = /[ㄱ-ㅎ]/.test(nq);

  if (hasJamo) {
    const cAll = (cTitle + " " + cArtist).replace(/\s+/g, " ");
    return cAll.includes(nq.replace(/\s+/g, ""));
  }

  // 일반 검색: 제목/아티스트/키
  return (
    title.includes(nq) ||
    artist.includes(nq) ||
    key === nq
  );
}

function sortSongs(list, sortMode) {
  const arr = [...list];
  if (sortMode === "latest") {
    arr.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sortMode === "g2a") {
    arr.sort((a, b) => compareTitleByOrder(a.title, b.title, ["num", "kor", "eng"]));
  } else if (sortMode === "a2g") {
    arr.sort((a, b) => compareTitleByOrder(a.title, b.title, ["eng", "kor", "num"]));
  } else {
    // 가나다순: 제목 기준
    arr.sort((a,b) => (a.title || "").localeCompare(b.title || "", "ko"));
  }
  return arr;
}

function getTitleGroup(title = "") {
  const text = String(title).normalize("NFC").trim();
  const ch = text[0] || "";
  if (/[0-9]/.test(ch)) return "num";
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)) return "kor";
  if (/[A-Za-z]/.test(ch)) return "eng";
  return "etc";
}

function compareTitleByOrder(aTitle = "", bTitle = "", groupOrder = ["num", "kor", "eng"]) {
  const rank = new Map(groupOrder.map((g, i) => [g, i]));
  const aGroup = getTitleGroup(aTitle);
  const bGroup = getTitleGroup(bTitle);
  const aRank = rank.has(aGroup) ? rank.get(aGroup) : 99;
  const bRank = rank.has(bGroup) ? rank.get(bGroup) : 99;
  if (aRank !== bRank) return aRank - bRank;
  return String(aTitle || "").localeCompare(String(bTitle || ""), "ko");
}

function isMobileViewport() {
  const small = window.matchMedia("(max-width: 768px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  return small && (coarse || mobileUA);
}

function syncSortOptionsByViewport() {
  const sort = $("#sort");
  if (!sort) return;
  const current = sort.value;
  sort.innerHTML = `
    <option value="g2a">가-A</option>
    <option value="a2g">A-가</option>
  `;
  sort.value = current === "a2g" ? "a2g" : "g2a";
}

function renderSortDropdownFromSelect() {
  const sort = $("#sort");
  const menu = $("#sortMenu");
  const trigger = $("#sortTrigger");
  if (!sort || !menu || !trigger) return;

  const options = Array.from(sort.options);
  const selected = options.find((o) => o.value === sort.value) || options[0];
  trigger.textContent = selected?.textContent || "";

  menu.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sort-option${opt.value === sort.value ? " active" : ""}`;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", opt.value === sort.value ? "true" : "false");
    btn.textContent = opt.textContent;
    btn.addEventListener("click", () => {
      sort.value = opt.value;
      closeSortMenu();
      renderSortDropdownFromSelect();
      render();
    });
    menu.appendChild(btn);
  });
}

function closeSortMenu() {
  const menu = $("#sortMenu");
  const trigger = $("#sortTrigger");
  if (!menu || !trigger) return;
  menu.classList.add("hidden");
  trigger.setAttribute("aria-expanded", "false");
}

function toggleSortMenu() {
  const menu = $("#sortMenu");
  const trigger = $("#sortTrigger");
  if (!menu || !trigger) return;
  const willOpen = menu.classList.contains("hidden");
  if (willOpen) {
    menu.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
  } else {
    closeSortMenu();
  }
}

function render() {
  const q = $("#q").value;
  const sortMode = $("#sort").value;
  document.querySelectorAll(".table").forEach((el) => {
    el.classList.toggle("select-mode", state.selectMode);
  });

  const filtered = state.songs.filter(s => matchesQuery(s, q));
  const sorted = sortSongs(filtered, sortMode);
  if (state.selectMode && state.selectedIds.length > 0) {
    const selectedMap = new Map(sorted.map((song) => [song.id, song]));
    const selectedTop = state.selectedIds
      .map((id) => selectedMap.get(id))
      .filter(Boolean);
    const selectedSet = new Set(selectedTop.map((song) => song.id));
    const rest = sorted.filter((song) => !selectedSet.has(song.id));
    state.filtered = [...selectedTop, ...rest];
  } else {
    state.filtered = sorted;
  }

  const tbody = $("#tbody");
  tbody.innerHTML = "";
  const rowActionDisabled = isMobileViewport() && state.selectMode;
  const disableMobileTitlePreview = isMobileViewport() && state.selectMode;
  const showMobileMoveHandle = isMobileViewport() && state.selectMode;

  for (const song of state.filtered) {
    const tr = document.createElement("tr");
    tr.dataset.songId = song.id;
    tr.dataset.scrollToken = getScrollToken(song.title);
    const selectedOrder = state.selectedIds.indexOf(song.id);
    if (selectedOrder >= 0) {
      tr.classList.add("selected-row");
      tr.dataset.selectedOrder = String(selectedOrder);
      if (isMobileViewport() && state.selectMode) {
        tr.classList.add("mobile-reorder-row");
        tr.addEventListener("pointermove", (e) => {
          moveMobileRowDrag(e);
        });
        tr.addEventListener("pointerup", (e) => {
          endMobileRowDrag(e);
        });
        tr.addEventListener("pointercancel", (e) => {
          endMobileRowDrag(e);
        });
      }
    }

    // selection cell
    const tdCheck = document.createElement("td");
    tdCheck.className = "col-check";
    if (state.selectMode) {
      const order = state.selectedIds.indexOf(song.id);
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = order >= 0 ? String(order + 1) : "";
      badge.style.cursor = "pointer";
      badge.title = order >= 0 ? "선택 해제" : "선택";
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSelect(song.id);
      });
      tdCheck.appendChild(badge);
    } else {
      tdCheck.textContent = "";
    }

    const tdTitle = document.createElement("td");
    tdTitle.className = "col-title";
    const titleBtn = document.createElement("button");
    titleBtn.type = "button";
    titleBtn.className = "titlebtn";
    titleBtn.textContent = song.title;
    if (disableMobileTitlePreview) {
      titleBtn.setAttribute("aria-disabled", "true");
      titleBtn.style.pointerEvents = "none";
      titleBtn.addEventListener("click", (e) => e.preventDefault());
    } else {
      titleBtn.addEventListener("click", () => openPreview(song));
    }
    const artistSub = document.createElement("div");
    artistSub.className = "artist-sub";
    artistSub.textContent = song.artist;
    tdTitle.append(titleBtn, artistSub);

    const tdArtist = document.createElement("td");
    tdArtist.className = "col-artist";
    const artistText = document.createElement("span");
    artistText.className = "artist-text";
    artistText.textContent = song.artist;
    tdArtist.appendChild(artistText);

    const tdKey = document.createElement("td");
    tdKey.className = "col-key";
    tdKey.textContent = song.key;

    const tdMove = document.createElement("td");
    tdMove.className = "col-move";
    if (showMobileMoveHandle && selectedOrder >= 0) {
      const moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "mobile-move-handle";
      moveBtn.title = "순서 이동";
      moveBtn.setAttribute("aria-label", "순서 이동");
      moveBtn.innerHTML = `
        <svg class="icon-action" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7h12"></path>
          <path d="M6 12h12"></path>
          <path d="M6 17h12"></path>
        </svg>
      `;
      moveBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        startMobileRowDrag(e, tr, song.id);
      });
      tdMove.appendChild(moveBtn);
    }

    const tdDown = document.createElement("td");
    tdDown.className = "col-act";
    const downA = document.createElement("a");
    downA.className = "smallbtn";
    downA.innerHTML = `
      <svg class="icon-action" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v11"></path>
        <path d="M8 11l4 4 4-4"></path>
        <path d="M6 19h12"></path>
      </svg>
    `;
    downA.title = "다운로드";
    downA.setAttribute("aria-label", "다운로드");
    downA.href = song.pdfUrl;
    downA.setAttribute("download", "");
    downA.addEventListener("click", async (e) => {
      if (!isMobileViewport()) return;
      e.preventDefault();
      const filename = `${sanitizeFilename(song.title || "score")}.pdf`;
      await downloadOrSharePdfUrl(song.pdfUrl, filename);
    });
    if (rowActionDisabled) {
      downA.classList.add("is-disabled");
      downA.setAttribute("aria-disabled", "true");
      downA.addEventListener("click", (e) => e.preventDefault());
    }
    tdDown.appendChild(downA);

    const tdShare = document.createElement("td");
    tdShare.className = "col-act";
    const shareBtn = document.createElement("button");
    shareBtn.className = "smallbtn";
    shareBtn.innerHTML = `
      <svg class="icon-action" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11"></path>
        <path d="M8 7l4-4 4 4"></path>
        <path d="M7 10H6a2 2 0 0 0-2 2v6a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-6a2 2 0 0 0-2-2h-1"></path>
      </svg>
    `;
    shareBtn.title = "공유";
    shareBtn.setAttribute("aria-label", "공유");
    shareBtn.disabled = rowActionDisabled;
    shareBtn.addEventListener("click", () => shareSingle(song));
    tdShare.appendChild(shareBtn);

    tr.append(tdCheck, tdTitle, tdArtist, tdKey, tdMove, tdDown, tdShare);
    tbody.appendChild(tr);
  }

  updateSelectedBar();
  const canUseSelectionActions = state.selectMode && state.selectedIds.length > 0;
  $("#btnClearSelected").disabled = !canUseSelectionActions;
  $("#btnShareSelected").disabled = !canUseSelectionActions;
  $("#btnMergeSelected").disabled = !canUseSelectionActions;
  renderScrollIndex();
  syncScrollIndexOffset();
  updateScrollIndexThumb();
  applyMobileSelectedSticky();
}

function applyMobileSelectedSticky() {
  const rows = Array.from($("#tbody")?.querySelectorAll("tr") || []);
  rows.forEach((row) => {
    row.classList.remove("mobile-sticky-row");
    row.classList.remove("mobile-sticky-last");
    row.style.removeProperty("--sticky-top");
    row.style.removeProperty("--sticky-z");
  });

  if (!isMobileViewport() || !state.selectMode || state.selectedIds.length === 0) return;

  const selectedRows = rows
    .filter((row) => row.classList.contains("selected-row"))
    .sort((a, b) => Number(a.dataset.selectedOrder || "0") - Number(b.dataset.selectedOrder || "0"));

  let topOffset = 0;
  selectedRows.forEach((row, idx) => {
    const rowHeight = row.getBoundingClientRect().height;
    row.classList.add("mobile-sticky-row");
    row.style.setProperty("--sticky-top", `${topOffset}px`);
    row.style.setProperty("--sticky-z", String(30 + (selectedRows.length - idx)));
    topOffset += rowHeight;
  });
  const lastRow = selectedRows[selectedRows.length - 1];
  if (lastRow) lastRow.classList.add("mobile-sticky-last");

}

function getScrollToken(title = "") {
  const text = String(title).normalize("NFC").trim();
  if (!text) return ".";
  const ch = text[0];
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const idx = Math.floor((code - 0xac00) / (21 * 28));
    return toSimpleInitial(KOR_INITIALS[idx] || ".");
  }
  if (/[ㄱ-ㅎ]/.test(ch)) return toSimpleInitial(ch);
  if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return "#";
  return ".";
}

function toSimpleInitial(ch = "") {
  const map = {
    "ㄲ": "ㄱ",
    "ㄸ": "ㄷ",
    "ㅃ": "ㅂ",
    "ㅆ": "ㅅ",
    "ㅉ": "ㅈ",
  };
  return map[ch] || ch;
}

function renderScrollIndex() {
  const rail = $("#scrollIndex");
  const scroller = $("#tableScroll");
  const thumb = $("#scrollIndexThumb");
  const rows = Array.from($("#tbody")?.querySelectorAll("tr") || []);
  if (!rail || !scroller || rows.length === 0) {
    if (rail) {
      rail.innerHTML = "";
      if (thumb) rail.appendChild(thumb);
    }
    return;
  }

  const counts = new Map(SCROLL_INDEX_TOKENS.map((t) => [t, 0]));
  const firstOffsets = new Map();
  for (const row of rows) {
    const token = row.dataset.scrollToken || ".";
    if (counts.has(token)) counts.set(token, counts.get(token) + 1);
    if (!firstOffsets.has(token)) firstOffsets.set(token, row.offsetTop);
  }

  const maxScrollTop = Math.max(1, scroller.scrollHeight - scroller.clientHeight);

  rail.innerHTML = "";
  if (thumb) rail.appendChild(thumb);
  SCROLL_INDEX_TOKENS.forEach((token) => {
    const count = counts.get(token) || 0;
    if (count <= 0 || !firstOffsets.has(token)) return;
    const item = document.createElement("span");
    const label = token;
    item.className = "scroll-index-item";
    item.dataset.token = token;
    item.dataset.visible = "1";
    item.textContent = label;
    const ratio = Math.min(1, Math.max(0, firstOffsets.get(token) / maxScrollTop));
    item.style.top = `${(ratio * 100).toFixed(2)}%`;
    item.classList.add("clickable");
    item.addEventListener("click", () => {
      const targetTop = Math.max(0, (firstOffsets.get(token) || 0) + 1);
      scroller.scrollTo({ top: targetTop, behavior: "auto" });
    });
    rail.appendChild(item);
  });
}

function syncScrollIndexOffset() {
  const wrap = document.querySelector(".table-wrap");
  const head = document.querySelector(".table-head");
  if (!wrap || !head) return;
  wrap.style.setProperty("--table-head-h", `${head.offsetHeight}px`);
}

function setScrollByIndexClientY(clientY) {
  const rail = $("#scrollIndex");
  const scroller = $("#tableScroll");
  if (!rail || !scroller) return;

  const rect = rail.getBoundingClientRect();
  const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));
  const ratio = rect.height > 0 ? (clampedY - rect.top) / rect.height : 0;
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = ratio * maxScrollTop;
  updateScrollIndexThumb();
}

function ensureScrollIndexHint() {
  let hint = document.querySelector(".scroll-index-hint");
  if (hint) return hint;
  const wrap = document.querySelector(".table-wrap");
  if (!wrap) return null;
  hint = document.createElement("div");
  hint.className = "scroll-index-hint hidden";
  wrap.appendChild(hint);
  return hint;
}

function getNearestScrollToken(clientY) {
  const rail = $("#scrollIndex");
  if (!rail) return "";
  const items = Array.from(rail.querySelectorAll(".scroll-index-item"));
  if (!items.length) return "";
  let nearest = items[0];
  let nearestDist = Infinity;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const dist = Math.abs(centerY - clientY);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = item;
    }
  }
  return nearest.dataset.token || nearest.textContent || "";
}

function updateScrollIndexHint(clientY) {
  const rail = $("#scrollIndex");
  const wrap = document.querySelector(".table-wrap");
  const hint = ensureScrollIndexHint();
  if (!rail || !wrap || !hint) return;
  const railRect = rail.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const clampedY = Math.max(railRect.top, Math.min(railRect.bottom, clientY));
  const yInWrap = clampedY - wrapRect.top;
  const token = getNearestScrollToken(clampedY);
  hint.textContent = token;
  hint.style.top = `${yInWrap}px`;
}

function startScrollIndexDrag(e) {
  if (isModalOpen()) return;
  const rail = $("#scrollIndex");
  if (!rail) return;
  if (!isMobileViewport()) {
    setScrollByIndexClientY(e.clientY);
    e.preventDefault();
    return;
  }
  scrollIndexDragState = { pointerId: e.pointerId };
  rail.classList.add("dragging");
  const hint = ensureScrollIndexHint();
  hint?.classList.remove("hidden");
  try {
    rail.setPointerCapture(e.pointerId);
  } catch {}
  updateScrollIndexHint(e.clientY);
  setScrollByIndexClientY(e.clientY);
  e.preventDefault();
}

function moveScrollIndexDrag(e) {
  if (!scrollIndexDragState) return;
  if (scrollIndexDragState.pointerId !== e.pointerId) return;
  updateScrollIndexHint(e.clientY);
  setScrollByIndexClientY(e.clientY);
  e.preventDefault();
}

function endScrollIndexDrag(e) {
  if (!scrollIndexDragState) return;
  if (scrollIndexDragState.pointerId !== e.pointerId) return;
  const rail = $("#scrollIndex");
  if (rail) {
    rail.classList.remove("dragging");
    try {
      rail.releasePointerCapture(e.pointerId);
    } catch {}
  }
  const hint = document.querySelector(".scroll-index-hint");
  hint?.classList.add("hidden");
  scrollIndexDragState = null;
}

function routeMobileWheelToTableScroll(e) {
  if (!isMobileViewport()) return;
  const modal = $("#modal");
  if (modal && !modal.classList.contains("hidden")) return;

  const scroller = $("#tableScroll");
  if (!scroller) return;

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  if (maxScrollTop <= 0) return;

  const prevTop = scroller.scrollTop;
  const nextTop = Math.max(0, Math.min(maxScrollTop, prevTop + e.deltaY));
  if (nextTop === prevTop) return;
  scroller.scrollTop = nextTop;
  e.preventDefault();
}

function isModalOpen() {
  const modal = $("#modal");
  return !!(modal && !modal.classList.contains("hidden"));
}

function onMobileTouchStartForScroll(e) {
  if (!isMobileViewport() || isModalOpen()) return;
  if (!e.touches || e.touches.length < 2) {
    mobileTwoFingerScrollY = null;
    return;
  }
  const ySum = Array.from(e.touches).reduce((sum, t) => sum + t.clientY, 0);
  mobileTwoFingerScrollY = ySum / e.touches.length;
}

function onMobileTouchMoveForScroll(e) {
  if (!isMobileViewport() || isModalOpen()) return;
  if (!e.touches || e.touches.length < 2) {
    mobileTwoFingerScrollY = null;
    return;
  }
  const scroller = $("#tableScroll");
  if (!scroller) return;

  const ySum = Array.from(e.touches).reduce((sum, t) => sum + t.clientY, 0);
  const avgY = ySum / e.touches.length;
  if (mobileTwoFingerScrollY == null) {
    mobileTwoFingerScrollY = avgY;
    return;
  }
  const dy = mobileTwoFingerScrollY - avgY;
  mobileTwoFingerScrollY = avgY;
  if (Math.abs(dy) < 0.5) return;

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  if (maxScrollTop <= 0) return;
  const prevTop = scroller.scrollTop;
  const nextTop = Math.max(0, Math.min(maxScrollTop, prevTop + dy));
  if (nextTop === prevTop) return;
  scroller.scrollTop = nextTop;
  e.preventDefault();
}

function onMobileTouchEndForScroll() {
  mobileTwoFingerScrollY = null;
}

function updateScrollIndexThumb() {
  const scroller = $("#tableScroll");
  const rail = $("#scrollIndex");
  const thumb = $("#scrollIndexThumb");
  if (!scroller || !thumb || !rail) return;
  const maxScrollTop = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const ratio = Math.min(1, Math.max(0, scroller.scrollTop / maxScrollTop));
  const radius = thumb.offsetHeight / 2 || 4;
  const usable = Math.max(0, rail.clientHeight - radius * 2);
  const y = radius + usable * ratio;
  thumb.style.top = `${y.toFixed(2)}px`;
  updateScrollIndexCurrentByTop(scroller, rail);
}

function updateScrollIndexCurrentByTop(scroller, rail) {
  const items = Array.from(rail.querySelectorAll(".scroll-index-item"));
  for (const item of items) {
    item.classList.remove("current");
  }
  const rows = Array.from($("#tbody")?.querySelectorAll("tr") || []);
  if (rows.length === 0) return;
  const top = scroller.scrollTop;

  // 기준: 현재 scrollTop 이하에서 가장 마지막으로 시작한 행
  // (경계값에서 이전 행이 잘못 잡히는 문제 방지)
  let currentRow = rows[0];
  for (const row of rows) {
    if (row.offsetTop <= top + 0.5) currentRow = row;
    else break;
  }
  const token = currentRow?.dataset?.scrollToken || "";
  if (!token) return;
  const current = items.find((item) => item.dataset.token === token);
  if (current) current.classList.add("current");
}

function toggleSelect(id) {
  const idx = state.selectedIds.indexOf(id);
  if (idx >= 0) state.selectedIds.splice(idx, 1);
  else state.selectedIds.push(id);
  persistSelectionToShareLink();
  render();
}

function clearMobileRowDropTarget() {
  document.querySelectorAll(".mobile-row-drop-target").forEach((el) => {
    el.classList.remove("mobile-row-drop-target");
  });
}

function cancelMobileRowDrag() {
  if (!mobileRowDragState) return;
  const row = mobileRowDragState.row;
  if (row) {
    row.classList.remove("mobile-row-dragging");
    row.style.removeProperty("--drag-dy");
  }
  clearMobileRowDropTarget();
  mobileRowDragState = null;
}

function getMobileRowDropTarget(e, dragId) {
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const target = hit?.closest("tr.mobile-reorder-row.selected-row[data-song-id]");
  if (!target) return null;
  const targetId = target.dataset.songId;
  if (!targetId || targetId === dragId) return null;
  const rect = target.getBoundingClientRect();
  const insertAfter = e.clientY > rect.top + rect.height / 2;
  return { target, targetId, insertAfter };
}

function startMobileRowDrag(e, row, id) {
  if (!isMobileViewport() || !state.selectMode) return;
  if (!state.selectedIds.includes(id)) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (e.pointerType === "touch" && !e.isPrimary) {
    cancelMobileRowDrag();
    return;
  }
  if (!e.target.closest(".mobile-move-handle")) return;

  if (mobileRowDragState && mobileRowDragState.pointerId !== e.pointerId) {
    cancelMobileRowDrag();
  }

  mobileRowDragState = {
    id,
    row,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    dragging: true,
  };
  mobileRowDragState.row.classList.add("mobile-row-dragging");
  mobileRowDragState.row.style.setProperty("--drag-dy", "0px");
  try {
    mobileRowDragState.row.setPointerCapture(e.pointerId);
  } catch {}
}

function moveMobileRowDrag(e) {
  if (!mobileRowDragState) return;
  if (mobileRowDragState.pointerId !== e.pointerId) return;
  if (e.pointerType === "touch" && !e.isPrimary) return;

  const dy = e.clientY - mobileRowDragState.startY;

  mobileRowDragState.row.style.setProperty("--drag-dy", `${dy}px`);
  const drop = getMobileRowDropTarget(e, mobileRowDragState.id);
  clearMobileRowDropTarget();
  if (drop) drop.target.classList.add("mobile-row-drop-target");
  e.preventDefault();
}

function endMobileRowDrag(e) {
  if (!mobileRowDragState) return;
  if (mobileRowDragState.pointerId !== e.pointerId) {
    if (e.pointerType === "touch" && !e.isPrimary) cancelMobileRowDrag();
    return;
  }

  const dragId = mobileRowDragState.id;
  const dragRow = mobileRowDragState.row;
  const wasDragging = mobileRowDragState.dragging;
  const drop = wasDragging ? getMobileRowDropTarget(e, dragId) : null;

  dragRow.classList.remove("mobile-row-dragging");
  dragRow.style.removeProperty("--drag-dy");
  clearMobileRowDropTarget();
  try {
    dragRow.releasePointerCapture(e.pointerId);
  } catch {}
  mobileRowDragState = null;

  if (!drop) return;
  reorderSelectedByDrop(dragId, drop.targetId, drop.insertAfter);
  persistSelectionToShareLink();
  render();
}

function reorderSelectedByDrop(dragId, targetId, insertAfter) {
  const from = state.selectedIds.indexOf(dragId);
  const target = state.selectedIds.indexOf(targetId);
  if (from < 0 || target < 0 || from === target) return;
  const [picked] = state.selectedIds.splice(from, 1);
  let to = target;
  if (from < target) to -= 1;
  if (insertAfter) to += 1;
  state.selectedIds.splice(to, 0, picked);
}

function clearChipDropClasses(chips) {
  for (const el of chips.querySelectorAll(".chip")) {
    el.classList.remove("drop-before", "drop-after");
  }
}

function getChipDropTarget(e, draggingId) {
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const target = hit?.closest(".chip[data-id]");
  if (!target) return null;
  if (target.dataset.id === draggingId) return null;
  const rect = target.getBoundingClientRect();
  const insertAfter = e.clientX > rect.left + rect.width / 2;
  return { target, targetId: target.dataset.id, insertAfter };
}

function updateSelectedBar() {
  const bar = $("#selectedBar");
  const chips = $("#selectedChips");
  const clearBtn = $("#btnClearSelected");
  clearBtn.classList.remove("hidden");

  if (!state.selectMode || state.selectedIds.length === 0) {
    bar.classList.add("selected-bar-collapsed");
    chips.innerHTML = "";
    return;
  }

  bar.classList.remove("selected-bar-collapsed");
  chips.innerHTML = "";

  state.selectedIds.forEach((id, i) => {
    const song = state.songs.find(s => s.id === id);
    if (!song) return;

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.id = id;
    const num = document.createElement("strong");
    num.className = "chip-num";
    num.textContent = String(i + 1);

    const title = document.createElement("span");
    title.className = "chip-text";
    title.textContent = song.title;

    chip.append(num, title);
    chip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;
      chipDragState = {
        id,
        pointerId: e.pointerId,
        chip,
        startX: e.clientX,
        startY: e.clientY,
      };
      chip.classList.add("dragging");
      chip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    chip.addEventListener("pointermove", (e) => {
      if (!chipDragState) return;
      if (chipDragState.pointerId !== e.pointerId) return;
      const dx = e.clientX - chipDragState.startX;
      const dy = e.clientY - chipDragState.startY;
      chip.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
      const drop = getChipDropTarget(e, chipDragState.id);
      clearChipDropClasses(chips);
      if (!drop) return;
      drop.target.classList.add(drop.insertAfter ? "drop-after" : "drop-before");
    });
    chip.addEventListener("pointerup", (e) => {
      if (!chipDragState) return;
      if (chipDragState.pointerId !== e.pointerId) return;
      const dragId = chipDragState.id;
      const drop = getChipDropTarget(e, dragId);
      chip.classList.remove("dragging");
      chip.style.transform = "";
      clearChipDropClasses(chips);
      chipDragState = null;
      if (!drop) return;
      reorderSelectedByDrop(dragId, drop.targetId, drop.insertAfter);
      persistSelectionToShareLink();
      render();
    });
    chip.addEventListener("pointercancel", () => {
      if (!chipDragState) return;
      chip.classList.remove("dragging");
      chip.style.transform = "";
      clearChipDropClasses(chips);
      chipDragState = null;
    });

    const x = document.createElement("button");
    x.textContent = "×";
    x.title = "제거";
    x.dataset.action = "remove";
    x.addEventListener("click", () => toggleSelect(id));

    chip.appendChild(x);
    chips.appendChild(chip);
  });
}

function openPreview(song) {
  previewSong = song;
  previewPartialSelectMode = false;
  previewSelectedPages = new Set();
  previewEditMode = false;
  previewEditDeletePages = new Set();
  $("#mTitle").textContent = song.title;
  $("#mMeta").textContent = `${song.artist} · ${song.key}키`;
  $("#mEditPanel").classList.add("hidden");
  $("#modal").classList.remove("preview-edit-mode");
  $("#mEditTitle").value = song.title || "";
  $("#mEditArtist").value = song.artist || "";
  $("#mEditKey").value = song.key || "";
  $("#mEditAddPages").value = "";

  const img = $("#mImg");
  const pdfWrap = $("#mPdfMainWrap");
  const strip = $("#mPageStrip");
  const modal = $("#modal");
  modal.classList.remove("preview-partial-mode");
  const currentSession = ++previewSession;

  // PDF가 있으면 우선 렌더링, 없을 때만 jpg 표시
  if (song.pdfUrl) {
    previewMobileSlideMode = isMobileViewport();
    modal.classList.toggle("mobile-slide-mode", previewMobileSlideMode);
    previewPage = 1;
    previewTotalPages = 1;
    updatePreviewNavButtons();
    img.classList.add("hidden");
    img.src = "";
    pdfWrap.classList.toggle("hidden", previewMobileSlideMode);
    strip.classList.remove("hidden");
    strip.innerHTML = "";
    renderPdfPreview(song.pdfUrl, currentSession).catch((err) => {
      console.error(err);
      if (currentSession !== previewSession) return;
      alert("PDF 미리보기를 불러오지 못했어요.");
    });
  } else if (song.jpgUrl) {
    previewMobileSlideMode = false;
    modal.classList.remove("mobile-slide-mode");
    previewPage = 1;
    previewTotalPages = 1;
    img.src = song.jpgUrl;
    img.classList.remove("hidden");
    pdfWrap.classList.add("hidden");
    strip.classList.add("hidden");
    strip.innerHTML = "";
    updatePreviewNavButtons();
  } else {
    previewMobileSlideMode = false;
    modal.classList.remove("mobile-slide-mode");
    previewPage = 1;
    previewTotalPages = 1;
    img.classList.add("hidden");
    img.src = "";
    pdfWrap.classList.add("hidden");
    strip.classList.add("hidden");
    strip.innerHTML = "";
    updatePreviewNavButtons();
  }

  const dl = $("#mDownload");
  const partialBtn = $("#mDownloadPage");
  dl.href = song.pdfUrl;
  const safeTitle = sanitizeFilename(song.title || "score");
  dl.setAttribute("download", `${safeTitle}.pdf`);
  partialBtn.setAttribute("aria-pressed", "false");
  syncPartialDownloadButton();

  $("#modal").classList.remove("hidden");
}

function closeModal() {
  previewSession += 1;
  $("#modal").classList.add("hidden");
  $("#modal").classList.remove("mobile-slide-mode");
  $("#modal").classList.remove("preview-partial-mode");
  $("#mImg").src = "";
  const canvas = $("#mPdfMain");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
  canvas.width = 0;
  canvas.height = 0;
  $("#mPdfMainWrap").classList.add("hidden");
  $("#mPageStrip").innerHTML = "";
  $("#mPageStrip").classList.add("hidden");
  $("#mDownloadPage").classList.add("hidden");
  previewDoc = null;
  previewPage = 1;
  previewTotalPages = 1;
  previewMobileSlideMode = false;
  previewPartialSelectMode = false;
  previewSelectedPages = new Set();
  previewEditMode = false;
  previewEditDeletePages = new Set();
  $("#mEditPanel").classList.add("hidden");
  $("#modal").classList.remove("preview-edit-mode");
  $("#mEditAddPages").value = "";
  previewSong = null;
  syncPartialDownloadButton();
  updatePreviewNavButtons();
}

function openAddModal() {
  resetAddUploadProgress();
  $("#addModal").classList.remove("hidden");
}

function closeAddModal() {
  if (addUploadInProgress) return;
  resetAddUploadProgress();
  $("#addModal").classList.add("hidden");
}

function getAddSubmitButton() {
  return $("#btnSubmitAddFile");
}

function resetAddUploadProgress() {
  const wrap = $("#addUploadProgressWrap");
  const text = $("#addUploadProgressText");
  const percent = $("#addUploadProgressPercent");
  const bar = $("#addUploadProgressBar");
  wrap?.classList.add("hidden");
  if (text) text.textContent = "업로드 준비 중...";
  if (percent) percent.textContent = "0%";
  if (bar) bar.style.width = "0%";
}

function setAddUploadProgress(doneBytes, totalBytes, doneFiles, totalFiles) {
  const wrap = $("#addUploadProgressWrap");
  const text = $("#addUploadProgressText");
  const percent = $("#addUploadProgressPercent");
  const bar = $("#addUploadProgressBar");
  if (!wrap || !text || !percent || !bar) return;
  wrap.classList.remove("hidden");
  const safeTotal = Math.max(1, Number(totalBytes) || 1);
  const ratio = Math.max(0, Math.min(1, doneBytes / safeTotal));
  const pct = Math.round(ratio * 100);
  text.textContent = `업로드 중... (${doneFiles}/${totalFiles})`;
  percent.textContent = `${pct}%`;
  bar.style.width = `${pct}%`;
}

function sanitizeFilename(text) {
  return (text || "score")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim() || "score";
}

async function sharePdfBlobMobile(blob, filename, title = "PDF 공유") {
  if (!isMobileViewport() || !navigator.share) return false;
  try {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return true;
    }
  } catch (err) {
    if (err?.name === "AbortError") return true;
  }
  return false;
}

function forceDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadOrSharePdfUrl(pdfUrl, filename) {
  if (!pdfUrl) return;
  if (!isMobileViewport()) return;
  try {
    const res = await fetch(pdfUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("failed to fetch pdf");
    const blob = await res.blob();
    const shared = await sharePdfBlobMobile(blob, filename, filename.replace(/\.pdf$/i, ""));
    if (!shared) {
      const fallbackUrl = URL.createObjectURL(blob);
      window.open(fallbackUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(fallbackUrl), 60_000);
    }
  } catch (err) {
    console.error(err);
    window.open(pdfUrl, "_blank");
  }
}

function syncPartialDownloadButton() {
  const partialBtn = $("#mDownloadPage");
  const canShow = !!previewSong?.pdfUrl && previewTotalPages > 1 && !previewEditMode;
  const ready = previewPartialSelectMode && previewSelectedPages.size > 0;
  partialBtn.classList.toggle("hidden", !canShow);
  partialBtn.disabled = !canShow;
  partialBtn.classList.toggle("ready", ready);
}

function syncPreviewEditSelectionUI() {
  const strip = $("#mPageStrip");
  if (!strip) return;
  const thumbs = Array.from(strip.querySelectorAll(".page-thumb[data-page]"));
  thumbs.forEach((btn) => {
    const page = Number(btn.dataset.page);
    const picked = previewEditDeletePages.has(page);
    btn.classList.toggle("page-thumb-edit-picked", picked);
    if (previewEditMode) btn.setAttribute("aria-pressed", picked ? "true" : "false");
  });
}

function enterPreviewEditMode() {
  if (!previewSong) return;
  previewEditMode = true;
  previewEditDeletePages = new Set();
  previewPartialSelectMode = false;
  previewSelectedPages = new Set();
  $("#mEditPanel").classList.remove("hidden");
  $("#modal").classList.add("preview-edit-mode");
  $("#mEditTitle").value = previewSong.title || "";
  $("#mEditArtist").value = previewSong.artist || "";
  $("#mEditKey").value = previewSong.key || "";
  $("#mEditAddPages").value = "";
  syncPartialDownloadButton();
  syncPreviewPartialSelectionUI();
  syncPreviewEditSelectionUI();
}

function exitPreviewEditMode() {
  previewEditMode = false;
  previewEditDeletePages = new Set();
  $("#mEditPanel").classList.add("hidden");
  $("#modal").classList.remove("preview-edit-mode");
  $("#mEditAddPages").value = "";
  syncPartialDownloadButton();
  syncPreviewEditSelectionUI();
}

function isRemoteSongId(id = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id));
}

async function saveSongMetaToSupabase(song, patch = {}) {
  if (!window.SB?.isConfigured()) return false;
  if (!isRemoteSongId(song?.id)) return false;
  try {
    const client = window.SB.getClient();
    const { data } = await client.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return false;
    const { error } = await client
      .from(SB_SONGS_TABLE)
      .update(patch)
      .eq("id", song.id)
      .eq("owner_id", userId);
    if (error) {
      console.error("songs update 실패:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("songs update 오류:", err);
    return false;
  }
}

async function uploadEditedPdfBlob(blob, song) {
  if (!window.SB?.isConfigured() || !isRemoteSongId(song?.id)) return null;
  try {
    const client = window.SB.getClient();
    const { data } = await client.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return null;
    const file = new File([blob], `${sanitizeFilename(song.title || "score")}.pdf`, { type: "application/pdf" });
    return await uploadSongFileToSupabase(file, userId);
  } catch (err) {
    console.error("수정 PDF 업로드 실패:", err);
    return null;
  }
}

async function buildEditedPdfFromPreview(song, deletePagesSet, addFiles) {
  if (!window.PDFLib) throw new Error("PDFLib not loaded");
  const out = await PDFLib.PDFDocument.create();

  if (song.pdfUrl) {
    const res = await fetch(song.pdfUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("failed to fetch source pdf");
    const bytes = await res.arrayBuffer();
    const src = await PDFLib.PDFDocument.load(bytes);
    const keepIndices = src.getPageIndices().filter((idx) => !deletePagesSet.has(idx + 1));
    if (keepIndices.length) {
      const copied = await out.copyPages(src, keepIndices);
      copied.forEach((p) => out.addPage(p));
    }
  } else if (song.jpgUrl) {
    if (!deletePagesSet.has(1)) {
      const res = await fetch(song.jpgUrl, { cache: "no-store" });
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        const isPng = /\.png$/i.test(song.jpgUrl);
        const img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const page = out.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
    }
  }

  for (const file of addFiles) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    const isImage = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name || "");
    if (!isPdf && !isImage) continue;
    const bytes = await file.arrayBuffer();
    if (isPdf) {
      const src = await PDFLib.PDFDocument.load(bytes);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((p) => out.addPage(p));
    } else {
      const isPng = /^image\/png$/i.test(file.type) || /\.png$/i.test(file.name || "");
      const img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
  }

  if (out.getPageCount() === 0) throw new Error("no pages left");
  return await out.save();
}

async function applyPreviewEdit() {
  if (!previewSong) return;
  const title = $("#mEditTitle").value.trim();
  const artist = $("#mEditArtist").value.trim();
  const key = $("#mEditKey").value.trim();
  const addFiles = Array.from($("#mEditAddPages").files || []);
  if (!title) {
    alert("악보명을 입력해 주세요.");
    $("#mEditTitle").focus();
    return;
  }

  const hasPageEdit = previewEditDeletePages.size > 0 || addFiles.length > 0;
  const prevTitle = previewSong.title;
  previewSong.title = title;
  previewSong.artist = artist;
  previewSong.key = key;

  try {
    if (hasPageEdit) {
      const editedBytes = await buildEditedPdfFromPreview(previewSong, previewEditDeletePages, addFiles);
      const editedBlob = new Blob([editedBytes], { type: "application/pdf" });
      const remoteUrl = await uploadEditedPdfBlob(editedBlob, previewSong);
      const localUrl = remoteUrl || URL.createObjectURL(editedBlob);
      previewSong.pdfUrl = localUrl;
      previewSong.jpgUrl = "";
      $("#mDownload").href = previewSong.pdfUrl;
      $("#mDownload").setAttribute("download", `${sanitizeFilename(previewSong.title || "score")}.pdf`);
      const patch = {
        title: previewSong.title,
        artist: previewSong.artist,
        key: previewSong.key,
        pdf_url: previewSong.pdfUrl,
        jpg_url: "",
      };
      await saveSongMetaToSupabase(previewSong, patch);
    } else {
      await saveSongMetaToSupabase(previewSong, {
        title: previewSong.title,
        artist: previewSong.artist,
        key: previewSong.key,
      });
    }

    $("#mTitle").textContent = previewSong.title;
    $("#mMeta").textContent = `${previewSong.artist} · ${previewSong.key}키`;
    render();
    exitPreviewEditMode();
    openPreview(previewSong);
  } catch (err) {
    console.error(err);
    previewSong.title = prevTitle;
    alert("악보 수정 적용 중 오류가 발생했어요.");
  }
}

function syncPreviewPartialSelectionUI() {
  const strip = $("#mPageStrip");
  if (!strip) return;
  const thumbs = Array.from(strip.querySelectorAll(".page-thumb[data-page]"));
  thumbs.forEach((btn) => {
    const page = Number(btn.dataset.page);
    const picked = previewSelectedPages.has(page);
    btn.classList.toggle("page-thumb-picked", picked);
    btn.setAttribute("aria-pressed", picked ? "true" : "false");
  });
  syncPartialDownloadButton();
}

async function handlePreviewPartialDownload() {
  if (!previewSong?.pdfUrl || !previewDoc) return;
  const modal = $("#modal");
  const btn = $("#mDownloadPage");

  if (!previewPartialSelectMode) {
    previewPartialSelectMode = true;
    modal.classList.add("preview-partial-mode");
    syncPreviewPartialSelectionUI();
    return;
  }

  if (previewSelectedPages.size === 0) {
    alert("다운로드할 페이지를 선택해 주세요.");
    return;
  }

  if (!window.PDFLib) {
    alert("PDF 병합 라이브러리를 불러오지 못했어요.");
    return;
  }

  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "다운로드 중...";

  try {
    const res = await fetch(previewSong.pdfUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("failed to fetch pdf");
    const bytes = await res.arrayBuffer();
    const src = await PDFLib.PDFDocument.load(bytes);
    const out = await PDFLib.PDFDocument.create();
    const selectedPages = Array.from(previewSelectedPages)
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= src.getPageCount())
      .sort((a, b) => a - b);

    if (selectedPages.length === 0) {
      alert("선택한 페이지를 확인해 주세요.");
      return;
    }

    const indices = selectedPages.map((p) => p - 1);
    const pages = await out.copyPages(src, indices);
    pages.forEach((page) => out.addPage(page));

    const outBytes = await out.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    const filename = `${sanitizeFilename(previewSong.title)}_selected.pdf`;
    const shared = await sharePdfBlobMobile(blob, filename, `${previewSong.title} 선택 페이지`);
    if (!shared) forceDownloadBlob(blob, filename);

    previewPartialSelectMode = false;
    previewSelectedPages = new Set();
    modal.classList.remove("preview-partial-mode");
  } catch (err) {
    console.error(err);
    alert("페이지 일부 다운로드 중 오류가 발생했어요.");
  } finally {
    btn.textContent = prevText;
    syncPartialDownloadButton();
    syncPreviewPartialSelectionUI();
  }
}

function syncMobilePreviewActionLayout() {
  const head = document.querySelector("#modal .modal-head");
  const foot = document.querySelector("#modal .modal-foot");
  const closeBtn = head?.querySelector("[data-close]");
  const downloadBtn = $("#mDownload");
  if (!head || !foot || !closeBtn || !downloadBtn) return;

  if (closeBtn.parentElement !== head) head.appendChild(closeBtn);
  if (downloadBtn.parentElement !== foot) foot.appendChild(downloadBtn);
}

function toLocalSong(file, title, artist, key) {
  const url = URL.createObjectURL(file);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const isImage = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name || "");
  return {
    id: `song-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    artist,
    key,
    pdfUrl: isPdf ? url : "",
    jpgUrl: isImage ? url : "",
    createdAt: new Date().toISOString(),
  };
}

function getBaseName(filename = "") {
  return normalizeForMeta(String(filename).replace(/\.[^.]+$/, ""));
}

function parseFilenameMeta(filename = "") {
  // expected: 곡명_아티스트_키.ext
  const base = getBaseName(filename);
  if (!base.includes("_")) {
    return { title: base, artist: "", key: "" };
  }
  const parts = base.split("_").map((x) => normalizeForMeta(x)).filter(Boolean);
  if (parts.length < 3) {
    return { title: base, artist: "", key: "" };
  }
  const key = parts[parts.length - 1] || "";
  const artist = parts[parts.length - 2] || "";
  const title = normalizeForMeta(parts.slice(0, -2).join("_"));
  return { title, artist, key };
}

function normalizeForMeta(text = "") {
  return String(text || "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadSongsFromSupabase() {
  if (!window.SB?.isConfigured()) return [];
  try {
    const client = window.SB.getClient();
    if (!client) return [];

    const { data } = await client.auth.getSession();
    if (!data?.session?.user?.id) return [];

    const { data: rows, error } = await client
      .from(SB_SONGS_TABLE)
      .select("id, title, artist, key, pdf_url, jpg_url, created_at")
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(rows)) return [];
    return rows.map((row) => ({
      id: row.id,
      title: row.title || "",
      artist: row.artist || "",
      key: row.key || "",
      pdfUrl: row.pdf_url || "",
      jpgUrl: row.jpg_url || "",
      createdAt: row.created_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.error("Supabase songs 로드 오류:", err);
    return [];
  }
}

async function uploadSongFileToSupabase(file, userId) {
  const client = window.SB?.getClient?.();
  if (!client || !userId) throw new Error("Supabase session not ready");

  let ext = String(file.name || "").split(".").pop()?.toLowerCase() || "bin";
  if (!/^[a-z0-9]+$/.test(ext)) ext = "bin";
  if (!["pdf", "jpg", "jpeg", "png", "webp", "bin"].includes(ext)) ext = "bin";
  const random = Math.random().toString(36).slice(2, 8);
  // Supabase 경로 유효성 이슈를 피하기 위해 업로드 파일명은 안전한 ASCII로 고정
  const path = `${userId}/${Date.now()}_${random}.${ext}`;
  const bytes = await file.arrayBuffer();
  const blob = new Blob([bytes], { type: file.type || "application/octet-stream" });

  const { error: upErr } = await client.storage
    .from(SB_FILES_BUCKET)
    .upload(path, blob, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data: pub } = client.storage.from(SB_FILES_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("public url 생성 실패");
  return pub.publicUrl;
}

function toSongRecordPayload(title, artist, key, fileUrl, file) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const isImage = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name || "");
  return {
    title,
    artist,
    key,
    pdf_url: isPdf ? fileUrl : "",
    jpg_url: isImage ? fileUrl : "",
  };
}

async function handleAddFileSubmit(e) {
  e.preventDefault();
  if (addUploadInProgress) return;
  const fileInput = $("#addFileInput");
  const title = normalizeForMeta($("#addTitle").value);
  const artist = normalizeForMeta($("#addArtist").value);
  const key = normalizeForMeta($("#addKey").value);
  const files = Array.from(fileInput?.files || []);

  if (!files.length) {
    alert("파일을 선택해 주세요.");
    return;
  }

  const multiple = files.length > 1;

  const addableFiles = [];
  for (const file of files) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    const isImage = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name || "");
    if (!isPdf && !isImage) continue;
    addableFiles.push(file);
  }

  if (!addableFiles.length) {
    alert("PDF 또는 이미지 파일만 추가할 수 있어요.");
    return;
  }

  const submitBtn = getAddSubmitButton();
  const originalSubmitText = submitBtn?.textContent || "추가";
  const totalBytes = addableFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  let doneBytes = 0;
  let doneFiles = 0;
  addUploadInProgress = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "업로드 중...";
  }
  setAddUploadProgress(0, totalBytes, 0, addableFiles.length);

  // Supabase 우선 저장 (팀 공용 반영)
  if (window.SB?.isConfigured()) {
    try {
      const client = window.SB.getClient();
      const { data } = await client.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        addUploadInProgress = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalSubmitText;
        }
        return;
      }

      const uploadedSongs = [];
      for (const file of addableFiles) {
        const parsed = parseFilenameMeta(file.name);
        const autoTitle = parsed.title || getBaseName(file.name);
        const songTitle = multiple ? autoTitle : (title || autoTitle);
        const songArtist = multiple ? (parsed.artist || artist) : (artist || parsed.artist || "");
        const songKey = multiple ? (parsed.key || key) : (key || parsed.key || "");
        const fileUrl = await uploadSongFileToSupabase(file, userId);
        const payload = {
          owner_id: userId,
          ...toSongRecordPayload(songTitle, songArtist, songKey, fileUrl, file),
        };
        if (!payload.pdf_url && !payload.jpg_url) continue;

        const { data: row, error } = await client
          .from(SB_SONGS_TABLE)
          .insert(payload)
          .select("id, title, artist, key, pdf_url, jpg_url, created_at")
          .single();
        if (error) throw error;
        uploadedSongs.push({
          id: row.id,
          title: row.title || "",
          artist: row.artist || "",
          key: row.key || "",
          pdfUrl: row.pdf_url || "",
          jpgUrl: row.jpg_url || "",
          createdAt: row.created_at || new Date().toISOString(),
        });
        doneBytes += file.size || 0;
        doneFiles += 1;
        setAddUploadProgress(doneBytes, totalBytes, doneFiles, addableFiles.length);
      }

      if (!uploadedSongs.length) {
        alert("업로드 가능한 파일이 없습니다.");
        addUploadInProgress = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalSubmitText;
        }
        return;
      }
      state.songs = [...uploadedSongs, ...state.songs];
      addUploadInProgress = false;
      closeAddModal();
      $("#addFileForm").reset();
      render();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalSubmitText;
      }
      return;
    } catch (err) {
      console.error(err);
      alert("Supabase 업로드에 실패했어요. 로컬 추가로 전환합니다.");
    }
  }

  // Fallback: 기존 로컬 추가
  const addedSongs = [];
  for (const file of addableFiles) {
    const parsed = parseFilenameMeta(file.name);
    const autoTitle = parsed.title || getBaseName(file.name);
    const songTitle = multiple ? autoTitle : (title || autoTitle);
    const songArtist = multiple ? (parsed.artist || artist) : (artist || parsed.artist || "");
    const songKey = multiple ? (parsed.key || key) : (key || parsed.key || "");
    const localSong = toLocalSong(file, songTitle, songArtist, songKey);
    if (!localSong.pdfUrl && !localSong.jpgUrl) continue;
    addedSongs.push(localSong);
    doneBytes += file.size || 0;
    doneFiles += 1;
    setAddUploadProgress(doneBytes, totalBytes, doneFiles, addableFiles.length);
  }
  state.songs = [...addedSongs, ...state.songs];
  addUploadInProgress = false;
  closeAddModal();
  $("#addFileForm").reset();
  render();
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = originalSubmitText;
  }
}

function renderPageThumb(container, pageNumber, active, onClick) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = `page-thumb${active ? " active" : ""}`;
  item.dataset.page = String(pageNumber);

  const canvas = document.createElement("canvas");
  canvas.className = "page-thumb-canvas";
  canvas.width = 128;
  canvas.height = 180;

  const num = document.createElement("span");
  num.className = "page-thumb-num";
  num.textContent = `${pageNumber}p`;

  item.append(canvas, num);
  item.addEventListener("click", onClick);

  container.appendChild(item);
  return { item, canvas };
}

async function renderPdfPreview(pdfUrl, session) {
  if (!window.pdfjsLib) {
    alert("PDF 미리보기 라이브러리를 불러오지 못했어요.");
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  const doc = await loadingTask.promise;
  if (session !== previewSession) return;

  previewDoc = doc;
  previewPage = 1;
  previewTotalPages = doc.numPages;
  syncPartialDownloadButton();
  updatePreviewNavButtons();

  if (!previewMobileSlideMode) {
    await renderMainPage(1, session);
  }
  renderThumbStrip(doc, session, previewMobileSlideMode);
}

async function renderMainPage(pageNumber, session) {
  if (!previewDoc || session !== previewSession) return;
  const page = await previewDoc.getPage(pageNumber);
  if (session !== previewSession) return;

  const canvas = $("#mPdfMain");
  const containerWidth = $("#mPdfMainWrap").clientWidth - 16;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(containerWidth / baseViewport.width, 0.1);
  const viewport = page.getViewport({ scale });
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await page.render({ canvasContext: ctx, viewport }).promise;
  previewPage = pageNumber;
  syncPreviewThumbActive();
  updatePreviewNavButtons();
}

function renderThumbStrip(doc, session, slideMode = false) {
  const strip = $("#mPageStrip");
  strip.innerHTML = "";

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const thumb = renderPageThumb(
      strip,
      pageNumber,
      !slideMode && pageNumber === previewPage,
      async () => {
        if (previewEditMode) {
          if (previewEditDeletePages.has(pageNumber)) previewEditDeletePages.delete(pageNumber);
          else previewEditDeletePages.add(pageNumber);
          syncPreviewEditSelectionUI();
          return;
        }
        if (previewPartialSelectMode) {
          if (previewSelectedPages.has(pageNumber)) previewSelectedPages.delete(pageNumber);
          else previewSelectedPages.add(pageNumber);
          syncPreviewPartialSelectionUI();
          return;
        }
        if (slideMode) return;
        if (session !== previewSession) return;
        await renderMainPage(pageNumber, session);
      }
    );
    if (slideMode) thumb.item.classList.add("page-slide");
    if (slideMode) {
      const num = thumb.item.querySelector(".page-thumb-num");
      if (num) num.classList.add("hidden");
      const badge = document.createElement("span");
      badge.className = "page-slide-badge";
      badge.textContent = `${pageNumber}/${doc.numPages}`;
      thumb.item.appendChild(badge);
    }

    const targetWidth = slideMode
      ? Math.max(220, Math.floor(window.innerWidth * 0.72))
      : 128;
    renderThumbCanvas(doc, pageNumber, thumb.canvas, session, targetWidth);
  }
  syncPreviewPartialSelectionUI();
  syncPreviewEditSelectionUI();
}

async function renderThumbCanvas(doc, pageNumber, canvas, session, targetWidth = 128) {
  const page = await doc.getPage(pageNumber);
  if (session !== previewSession) return;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
}

function syncPreviewThumbActive() {
  if (previewMobileSlideMode) return;
  const strip = $("#mPageStrip");
  if (!strip) return;
  const thumbs = Array.from(strip.querySelectorAll(".page-thumb"));
  for (const btn of thumbs) {
    const active = Number(btn.dataset.page) === previewPage;
    btn.classList.toggle("active", active);
    if (active) {
      btn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }
}

function updatePreviewNavButtons() {
  const prevBtn = $("#mPrevPage");
  const nextBtn = $("#mNextPage");
  if (!prevBtn || !nextBtn) return;

  const canShow = isMobileViewport() && previewTotalPages > 1 && !previewMobileSlideMode;
  prevBtn.classList.toggle("hidden", !canShow || previewPage <= 1);
  nextBtn.classList.toggle("hidden", !canShow || previewPage >= previewTotalPages);
  if (!canShow) return;
}

async function shareSingle(song) {
  const pdfUrl = new URL(song.pdfUrl, location.href).toString();
  const text = `${song.title}${song.artist ? ` - ${song.artist}` : ""}`;

  if (navigator.share) {
    try {
      // 1) 가능하면 PDF 파일 자체를 공유
      if (song.pdfUrl) {
        const res = await fetch(song.pdfUrl, { cache: "no-store" });
        if (res.ok) {
          const blob = await res.blob();
          const safeName = (song.title || "sheet").replace(/[\\/:*?"<>|]+/g, "_");
          const file = new File([blob], `${safeName}.pdf`, { type: "application/pdf" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: song.title, text, files: [file] });
            return;
          }
        }
      }

      // 2) 파일 공유가 안 되면 링크 공유
      await navigator.share({ title: song.title, text, url: pdfUrl });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }

  // 3) 마지막 fallback: 링크 복사
  navigator.clipboard?.writeText(pdfUrl).then(() => {
    alert("공유 시트를 지원하지 않아 PDF 링크를 복사했어요.");
  }).catch(() => {
    prompt("복사해서 공유하세요:", pdfUrl);
  });
}

function buildShareLinkFromSelected(pkgMeta = {}) {
  // share.html?ids=... 형태로 링크 구성
  const params = new URLSearchParams();
  params.set("ids", state.selectedIds.join(","));
  const pkg = String(pkgMeta.pkgName || "").trim();
  const team = String(pkgMeta.team || "").trim();
  if (pkg) params.set("pkg", pkg);
  if (team) params.set("team", team);
  return `${location.origin}${location.pathname.replace(/index\.html?$/,"").replace(/\/$/,"/")}share.html?${params.toString()}`;
}

function mapTeamToVault(team = "") {
  if (team === "high") return "high";
  if (team === "middle") return "middle";
  return "all";
}

async function savePackageToVault(pkgMeta, link) {
  const vault = mapTeamToVault(pkgMeta?.team || "");
  const safeName = String(pkgMeta?.pkgName || "").trim() || "이름 없는 패키지";
  const item = {
    name: safeName,
    url: link,
    createdAt: new Date().toISOString(),
  };

  // Supabase configured: persist to DB first
  if (window.SB?.isConfigured()) {
    try {
      const client = window.SB.getClient();
      if (client) {
        const { data } = await client.auth.getSession();
        const userId = data?.session?.user?.id;
        if (userId) {
          const { error } = await client.from("packages").insert({
            owner_id: userId,
            vault,
            name: item.name,
            url: item.url,
          });
          if (!error) return;
          console.error("Supabase 보관함 저장 실패:", error);
        }
      }
    } catch (err) {
      console.error("Supabase 보관함 저장 오류:", err);
    }
  }

  // Fallback: localStorage
  const key = `scorebox_vault_${vault}`;
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.unshift(item);
    localStorage.setItem(key, JSON.stringify(prev));
  } catch (err) {
    console.error("보관함 저장 실패:", err);
  }
}

function openPackageCreateDialog() {
  const modal = $("#packageModal");
  const form = $("#packageForm");
  const input = $("#packageNameInput");
  const closeBtn = $("#btnClosePackageModal");
  const submitBtn = $("#btnSubmitPackage");
  const teamInputs = Array.from(form?.querySelectorAll("input[name='packageTeam']") || []);
  if (!modal || !form || !input) return Promise.resolve({ pkgName: "", team: "high" });

  return new Promise((resolve) => {
    const updateSubmitState = () => {
      const hasPkgName = input.value.trim().length > 0;
      const hasTeam = !!form.querySelector("input[name='packageTeam']:checked");
      if (submitBtn) submitBtn.disabled = !(hasPkgName && hasTeam);
    };

    const closeWith = (value) => {
      modal.classList.add("hidden");
      form.removeEventListener("submit", onSubmit);
      closeBtn?.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      input.removeEventListener("input", onChange);
      teamInputs.forEach((el) => el.removeEventListener("change", onChange));
      resolve(value);
    };

    const onSubmit = (e) => {
      e.preventDefault();
      const pkgName = input.value.trim();
      const team = form.querySelector("input[name='packageTeam']:checked")?.value || "";
      if (!pkgName) {
        input.setCustomValidity("패키지 이름은 필수입니다.");
        input.reportValidity();
        input.focus();
        return;
      }
      if (!team) return;
      input.setCustomValidity("");
      closeWith({
        pkgName,
        team,
      });
    };
    const onCancel = () => closeWith(null);
    const onBackdrop = (e) => {
      const target = e.target;
      if (target instanceof HTMLElement && target.hasAttribute("data-close-package")) {
        onCancel();
      }
    };
    const onChange = () => {
      input.setCustomValidity("");
      updateSubmitState();
    };

    input.value = "";
    input.setCustomValidity("");
    teamInputs.forEach((el) => {
      el.checked = false;
    });
    updateSubmitState();
    modal.classList.remove("hidden");
    input.focus();

    form.addEventListener("submit", onSubmit);
    input.addEventListener("input", onChange);
    teamInputs.forEach((el) => el.addEventListener("change", onChange));
    closeBtn?.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}

function persistSelectionToShareLink() {
  // 선택된 ids를 URL에도 반영(새로고침해도 유지)
  const url = new URL(location.href);
  if (state.selectedIds.length) url.searchParams.set("ids", state.selectedIds.join(","));
  else url.searchParams.delete("ids");
  history.replaceState({}, "", url.toString());
}

function hydrateSelectionFromUrl() {
  const url = new URL(location.href);
  const ids = (url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  // 존재하는 것만
  state.selectedIds = ids.filter(id => state.songs.some(s => s.id === id));
}

async function init() {
  let songs = [];
  try {
    const res = await fetch("./songs.json", { cache: "no-store" });
    if (res.ok) songs = await res.json();
  } catch (err) {
    console.warn("songs.json 로드 실패:", err);
  }
  const remoteSongs = await loadSongsFromSupabase();

  // id 없으면 생성(안전)
  const baseSongs = songs.map((s, i) => ({
    id: s.id || `song-${String(i+1).padStart(3,"0")}`,
    title: s.title || "",
    artist: s.artist || "",
    key: s.key || "",
    pdfUrl: s.pdfUrl || s.file || "",
    jpgUrl: s.jpgUrl || "",
    createdAt: s.createdAt || new Date().toISOString(),
  }));
  const merged = [...remoteSongs, ...baseSongs];
  const dedup = [];
  const seen = new Set();
  for (const song of merged) {
    if (!song?.id || seen.has(song.id)) continue;
    seen.add(song.id);
    dedup.push(song);
  }
  state.songs = dedup;

  hydrateSelectionFromUrl();
  syncSortOptionsByViewport();
  renderSortDropdownFromSelect();

  // controls
  const qInput = $("#q");
  const clearSearchBtn = $("#btnClearSearch");
  const syncSearchClearButton = () => {
    const hasText = (qInput.value || "").trim().length > 0;
    clearSearchBtn.classList.toggle("hidden", !hasText);
  };
  qInput.addEventListener("input", () => {
    syncSearchClearButton();
    render();
  });
  clearSearchBtn.addEventListener("click", () => {
    qInput.value = "";
    syncSearchClearButton();
    qInput.focus();
    render();
  });
  syncSearchClearButton();
  $("#sort").addEventListener("change", () => {
    renderSortDropdownFromSelect();
    render();
  });
  $("#sortTrigger").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSortMenu();
  });
  $("#sortMenu").addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closeSortMenu);
  $("#tableScroll").addEventListener("scroll", updateScrollIndexThumb);
  const rail = $("#scrollIndex");
  rail?.addEventListener("pointerdown", startScrollIndexDrag);
  rail?.addEventListener("pointermove", moveScrollIndexDrag);
  rail?.addEventListener("pointerup", endScrollIndexDrag);
  rail?.addEventListener("pointercancel", endScrollIndexDrag);
  document.addEventListener("wheel", routeMobileWheelToTableScroll, { passive: false, capture: true });
  document.addEventListener("touchstart", onMobileTouchStartForScroll, { passive: true, capture: true });
  document.addEventListener("touchmove", onMobileTouchMoveForScroll, { passive: false, capture: true });
  document.addEventListener("touchend", onMobileTouchEndForScroll, { passive: true, capture: true });
  document.addEventListener("touchcancel", onMobileTouchEndForScroll, { passive: true, capture: true });

  $("#btnSelectMode").addEventListener("click", () => {
    state.selectMode = !state.selectMode;
    $("#btnSelectMode").textContent = state.selectMode ? "선택 취소" : "선택";
    render();
  });

  $("#btnClearSelected").addEventListener("click", () => {
    state.selectedIds = [];
    persistSelectionToShareLink();
    render();
  });

  $("#btnShareSelected").addEventListener("click", async () => {
    if (!state.selectMode || state.selectedIds.length === 0) return;
    const pkgMeta = await openPackageCreateDialog();
    if (!pkgMeta) return;
    const link = buildShareLinkFromSelected(pkgMeta);
    if (!link) return;
    await savePackageToVault(pkgMeta, link);
    window.open(link, "_blank");
  });

  $("#btnMergeSelected").addEventListener("click", async () => {
    if (!state.selectMode || state.selectedIds.length === 0) return;
    if (!window.PDFLib) {
      alert("PDF 병합 라이브러리를 불러오지 못했어요.");
      return;
    }

    const popup = window.open("", "_blank");
    const btn = $("#btnMergeSelected");
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "병합 중...";

    try {
      const mergedPdf = await PDFLib.PDFDocument.create();

      for (const id of state.selectedIds) {
        const song = state.songs.find((s) => s.id === id);
        if (!song?.pdfUrl) continue;

        const res = await fetch(song.pdfUrl, { cache: "no-store" });
        if (!res.ok) continue;
        const bytes = await res.arrayBuffer();
        const src = await PDFLib.PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(src, src.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }

      if (mergedPdf.getPageCount() === 0) {
        if (popup) popup.close();
        alert("병합할 PDF가 없습니다.");
        return;
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);

      if (popup) {
        popup.location.href = blobUrl;
      } else {
        window.open(blobUrl, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      if (popup) popup.close();
      console.error(err);
      alert("PDF 병합 중 오류가 발생했어요.");
    } finally {
      btn.textContent = prevText;
      render();
    }
  });

  // modal close
  $("#modal").addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeModal();
  });
  $("#mPrevPage").addEventListener("click", async () => {
    if (!previewDoc) return;
    if (previewPage <= 1) return;
    const session = previewSession;
    await renderMainPage(previewPage - 1, session);
  });
  $("#mNextPage").addEventListener("click", async () => {
    if (!previewDoc) return;
    if (previewPage >= previewTotalPages) return;
    const session = previewSession;
    await renderMainPage(previewPage + 1, session);
  });
  $("#mDownloadPage").addEventListener("click", () => {
    handlePreviewPartialDownload().catch((err) => {
      console.error(err);
      alert("페이지 일부 다운로드 처리 중 오류가 발생했어요.");
    });
  });
  $("#mEditSong").addEventListener("click", () => {
    if (!previewSong) return;
    if (previewEditMode) {
      exitPreviewEditMode();
    } else {
      enterPreviewEditMode();
    }
  });
  $("#mEditCancel").addEventListener("click", () => {
    exitPreviewEditMode();
  });
  $("#mEditApply").addEventListener("click", () => {
    applyPreviewEdit().catch((err) => {
      console.error(err);
      alert("악보 수정 적용 중 오류가 발생했어요.");
    });
  });
  $("#mDownload").addEventListener("click", async (e) => {
    if (!isMobileViewport()) return;
    e.preventDefault();
    if (!previewSong?.pdfUrl) return;
    const filename = `${sanitizeFilename(previewSong.title || "score")}.pdf`;
    await downloadOrSharePdfUrl(previewSong.pdfUrl, filename);
  });
  $("#addModal").addEventListener("click", (e) => {
    if (e.target?.dataset?.closeAdd) closeAddModal();
  });
  $("#addFileForm").addEventListener("submit", handleAddFileSubmit);
  $("#btnAddFile").addEventListener("click", openAddModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeAddModal();
    }
  });
  window.addEventListener("resize", () => {
    const prev = $("#sort").value;
    syncSortOptionsByViewport();
    renderSortDropdownFromSelect();
    if (prev !== $("#sort").value) render();
    syncMobilePreviewActionLayout();
    updatePreviewNavButtons();
    syncScrollIndexOffset();
    renderScrollIndex();
    updateScrollIndexThumb();
    if ($("#modal").classList.contains("hidden")) return;
    if (!previewDoc) return;
    const session = previewSession;
    renderMainPage(previewPage, session).catch(() => {});
  });

  render();
  syncMobilePreviewActionLayout();
  updatePreviewNavButtons();
}

function buildShareMessage(ids, link) {
  const items = ids.map((id, idx) => {
    const s = state.songs.find(x => x.id === id);
    if (!s) return null;
    return `${idx+1}. ${s.title} (${s.key}) - ${s.artist}`;
  }).filter(Boolean);

  return `이번 주 악보 공유합니다 🙌
${items.join("\n")}

링크(선택 목록): ${link}
`;
}

init().catch(err => {
  console.error(err);
  alert("초기화 중 오류가 발생했습니다. 콘솔 로그를 확인해 주세요.");
});
