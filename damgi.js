/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);
const DAMGI_STORAGE_KEY = "scorebox_damgi_items";

function loadDamgiItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(DAMGI_STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveDamgiItems(items = []) {
  localStorage.setItem(DAMGI_STORAGE_KEY, JSON.stringify(items));
}

function getIncludedSummary(items = []) {
  let songs = 0;
  let pages = 0;
  (items || []).forEach((item) => {
    const pageCount = Number(item?.pageCount || (item?.jpgUrl ? 1 : 0));
    const excluded = new Set((item?.excludedPages || []).map((n) => Number(n)).filter((n) => n > 0));
    const includedCount = pageCount > 0
      ? Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => !excluded.has(p)).length
      : 0;
    if (includedCount <= 0) return;
    songs += 1;
    pages += includedCount;
  });
  return { songs, pages };
}

function updateCreateButtonLabel() {
  const btn = $("#btnCreateFromDamgi");
  if (!btn) return;
  const { songs, pages } = getIncludedSummary(loadDamgiItems());
  btn.textContent = `콘티 생성 (${songs}곡 ${pages}페이지)`;
}

function updateDamgiItem(songId, updater) {
  const items = loadDamgiItems();
  const idx = items.findIndex((item) => String(item.id) === String(songId));
  if (idx < 0) return null;
  const next = updater({ ...items[idx] }) || items[idx];
  items[idx] = next;
  saveDamgiItems(items);
  return next;
}

function setDamgiPageCount(songId, pageCount = 0) {
  updateDamgiItem(songId, (item) => ({ ...item, pageCount: Number(pageCount) || 0 }));
  updateCreateButtonLabel();
}

function toggleExcludedPage(songId, pageNum) {
  const updated = updateDamgiItem(songId, (item) => {
    const set = new Set((item.excludedPages || []).map((n) => Number(n)).filter((n) => n > 0));
    const target = Number(pageNum || 0);
    if (!target) return item;
    if (set.has(target)) set.delete(target);
    else set.add(target);
    return { ...item, excludedPages: Array.from(set).sort((a, b) => a - b) };
  });
  if (!updated) return false;
  return (updated.excludedPages || []).includes(Number(pageNum));
}

function isPageExcluded(item, pageNum) {
  const set = new Set((item?.excludedPages || []).map((n) => Number(n)));
  return set.has(Number(pageNum));
}

function createPageCard(songId, pageNum, excluded = false) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `damgi-page${excluded ? " is-excluded" : ""}`;

  const frame = document.createElement("div");
  frame.className = "damgi-page-frame";

  const strike = document.createElement("span");
  strike.className = "damgi-page-strike";
  frame.appendChild(strike);

  const label = document.createElement("div");
  label.className = "damgi-page-label";
  label.textContent = `페이지 ${pageNum}`;

  card.append(frame, label);
  card.addEventListener("click", () => {
    const nowExcluded = toggleExcludedPage(songId, pageNum);
    card.classList.toggle("is-excluded", nowExcluded);
    updateCreateButtonLabel();
  });

  return { card, frame };
}

async function renderPdfPages(item, pagesWrap) {
  if (!window.pdfjsLib || !item?.pdfUrl || !pagesWrap) {
    pagesWrap.innerHTML = '<div class="vault-empty">미리보기를 불러올 수 없습니다.</div>';
    return;
  }

  try {
    const task = pdfjsLib.getDocument(item.pdfUrl);
    const doc = await task.promise;
    setDamgiPageCount(item.id, doc.numPages);
    pagesWrap.innerHTML = "";

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const { card, frame } = createPageCard(item.id, pageNum, isPageExcluded(item, pageNum));
      const canvas = document.createElement("canvas");
      canvas.className = "damgi-page-canvas";
      frame.insertBefore(canvas, frame.firstChild);
      pagesWrap.appendChild(card);

      const page = await doc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = 98;
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  } catch {
    pagesWrap.innerHTML = '<div class="vault-empty">PDF 미리보기 로드 실패</div>';
  }
}

function renderJpgPage(item, pagesWrap) {
  pagesWrap.innerHTML = "";
  setDamgiPageCount(item.id, 1);
  const { card, frame } = createPageCard(item.id, 1, isPageExcluded(item, 1));
  const img = document.createElement("img");
  img.className = "damgi-page-image";
  img.loading = "lazy";
  img.alt = "악보 미리보기";
  img.src = item.jpgUrl;
  frame.insertBefore(img, frame.firstChild);
  pagesWrap.appendChild(card);
}

function renderSongPages(item, pagesWrap) {
  if (item.jpgUrl) {
    renderJpgPage(item, pagesWrap);
    return;
  }

  if (item.pdfUrl) {
    renderPdfPages(item, pagesWrap);
    return;
  }

  pagesWrap.innerHTML = '<div class="vault-empty">페이지 정보가 없습니다.</div>';
}

function encodeSharePayload(payloadSongs = []) {
  try {
    const json = JSON.stringify(payloadSongs);
    let binary = "";
    if (typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(json);
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
    } else {
      binary = unescape(encodeURIComponent(json));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

async function getCurrentNickname() {
  if (!window.SB?.isConfigured()) return "";
  try {
    const client = window.SB.getClient();
    if (!client) return "";
    const { data } = await client.auth.getSession();
    const session = data?.session;
    return String(
      session?.user?.user_metadata?.nickname ||
      session?.user?.email?.split("@")[0] ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

function mapTeamToVault(team = "") {
  const value = String(team || "").trim().toLowerCase();
  if (value === "high") return "high";
  if (value === "middle") return "middle";
  return "all";
}

async function savePackageToVaultFromDamgi(link) {
  const team = String(document.querySelector("input[name='damgiTeam']:checked")?.value || "").trim();
  const vault = mapTeamToVault(team);
  const safeName = String($("#damgiPackageName")?.value || "").trim() || "이름 없는 콘티";
  const item = {
    name: safeName,
    url: link,
    createdAt: new Date().toISOString(),
  };

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
          if (!error) return true;
          console.error("담기→보관함 저장 실패:", error);
          alert("콘티 저장에 실패했습니다.");
          return false;
        }
      }
    } catch (err) {
      console.error("담기→보관함 저장 오류:", err);
      alert("콘티 저장 중 오류가 발생했습니다.");
      return false;
    }
  }

  // Fallback: localStorage
  const key = `scorebox_vault_${vault}`;
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.unshift(item);
    localStorage.setItem(key, JSON.stringify(prev));
    return true;
  } catch (err) {
    console.error("로컬 보관함 저장 실패:", err);
    return false;
  }
}

async function buildShareLinkFromDamgi(items = []) {
  const songs = [];

  items.forEach((item) => {
    const pageCount = Number(item?.pageCount || (item?.jpgUrl ? 1 : 0));
    const excluded = new Set((item?.excludedPages || []).map((n) => Number(n)).filter((n) => n > 0));
    const includedPages = pageCount > 0
      ? Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => !excluded.has(p))
      : [];

    if (pageCount > 0 && includedPages.length === 0) return;

    songs.push({
      id: String(item?.id || ""),
      title: String(item?.title || ""),
      artist: String(item?.artist || ""),
      key: String(item?.key || ""),
      pdfUrl: String(item?.pdfUrl || ""),
      includedPages,
    });
  });

  const validSongs = songs.filter((song) => song.id && song.pdfUrl);
  if (!validSongs.length) return "";

  const params = new URLSearchParams();
  params.set("ids", validSongs.map((song) => song.id).join(","));
  const encoded = encodeSharePayload(validSongs);
  if (encoded) params.set("data", encoded);
  const pkg = String($("#damgiPackageName")?.value || "").trim();
  const team = String(document.querySelector("input[name='damgiTeam']:checked")?.value || "").trim();
  const memo = String($("#damgiPackageMemo")?.value || "").trim();
  const by = await getCurrentNickname();
  if (pkg) params.set("pkg", pkg);
  if (team) params.set("team", team);
  if (memo) params.set("memo", memo);
  if (by) params.set("by", by);

  return `${location.origin}${location.pathname.replace(/damgi\.html?$/, "").replace(/\/$/, "/")}share.html?${params.toString()}`;
}

function renderList() {
  const list = $("#damgiList");
  if (!list) return;
  const items = loadDamgiItems();

  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "vault-empty";
    empty.textContent = "담은 악보가 없습니다.";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "damgi-item";

    const head = document.createElement("div");
    head.className = "damgi-head";

    const title = document.createElement("div");
    title.className = "damgi-title";
    title.textContent = item.title || "제목 없음";

    const sub = document.createElement("div");
    sub.className = "damgi-sub";
    sub.textContent = `${item.artist || "아티스트"}${item.key ? ` · ${item.key}` : ""}`;

    const delBtn = document.createElement("button");
    delBtn.className = "btn vault-btn-delete damgi-del-btn";
    delBtn.type = "button";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      const next = loadDamgiItems().filter((x) => String(x.id) !== String(item.id));
      saveDamgiItems(next);
      renderList();
      updateCreateButtonLabel();
    });

    head.append(title, sub, delBtn);

    const pagesWrap = document.createElement("div");
    pagesWrap.className = "damgi-pages";
    pagesWrap.innerHTML = '<div class="vault-empty">페이지 로드 중...</div>';

    row.append(head, pagesWrap);
    list.appendChild(row);

    renderSongPages(item, pagesWrap);
  });
}

function init() {
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const teamRequired = $("#damgiTeamRequired");
  const nameRequired = $("#damgiNameRequired");
  const nameInput = $("#damgiPackageName");
  const teamInputs = Array.from(document.querySelectorAll("input[name='damgiTeam']"));
  let triedCreate = false;
  const syncRequiredIndicators = () => {
    const selected = document.querySelector("input[name='damgiTeam']:checked");
    const hasTeam = !!selected;
    const hasName = !!String(nameInput?.value || "").trim();
    teamRequired?.classList.toggle("hidden", !(triedCreate && !hasTeam));
    nameRequired?.classList.toggle("hidden", !(triedCreate && !hasName));
    return { hasTeam, hasName };
  };
  teamInputs.forEach((input) => {
    input.addEventListener("change", () => {
      syncRequiredIndicators();
    });
  });
  nameInput?.addEventListener("input", () => {
    syncRequiredIndicators();
  });

  $("#btnCreateFromDamgi")?.addEventListener("click", async () => {
    triedCreate = true;
    const { hasTeam, hasName } = syncRequiredIndicators();
    if (!hasTeam || !hasName) return;
    const link = await buildShareLinkFromDamgi(loadDamgiItems());
    if (!link) {
      alert("포함할 페이지가 없습니다.");
      return;
    }
    const saved = await savePackageToVaultFromDamgi(link);
    if (!saved) return;
    saveDamgiItems([]);
    location.href = link;
  });

  renderList();
  nameRequired?.classList.add("hidden");
  teamRequired?.classList.add("hidden");
  updateCreateButtonLabel();
}

document.addEventListener("DOMContentLoaded", init);
