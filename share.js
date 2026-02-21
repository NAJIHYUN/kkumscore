/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);

const shareState = {
  selectMode: false,
  pageCounts: new Map(),
  selectedPages: new Map(),
};

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
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

function sanitizeFilename(text = "") {
  return String(text)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function getSelectedPageTotal() {
  let total = 0;
  shareState.selectedPages.forEach((set) => {
    total += set.size;
  });
  return total;
}

function updateDownloadPickedUI() {
  const btn = $("#btnDownloadPicked");
  if (!btn) return;
  const shouldShow = shareState.selectMode && getSelectedPageTotal() > 0;
  btn.classList.toggle("hidden", !shouldShow);
}

function getVaultMetaFromTeam(team = "") {
  const value = String(team || "").trim().toLowerCase();
  if (value === "high") return { href: "./vault-dreamhigh.html", label: "☁️ 고등부" };
  if (value === "middle") return { href: "./vault-middle.html", label: "😎 중등부" };
  return { href: "./vault-all.html", label: "📂 기타" };
}

async function init() {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const res = await fetch("./songs.json", { cache: "no-store" });
  const rawSongs = await res.json();
  const songs = rawSongs.map((s, i) => ({
    id: s.id || `song-${String(i + 1).padStart(3, "0")}`,
    title: s.title || "",
    artist: s.artist || "",
    key: s.key || "",
    pdfUrl: s.pdfUrl || s.file || "",
  }));

  const url = new URL(location.href);
  const ids = (url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  const packageName = (url.searchParams.get("pkg") || "").trim();
  const packageTeam = (url.searchParams.get("team") || "").trim();
  const packageVaultBtn = $("#packageVaultBtn");
  if (packageVaultBtn) {
    const vaultMeta = getVaultMetaFromTeam(packageTeam);
    packageVaultBtn.href = vaultMeta.href;
    packageVaultBtn.textContent = vaultMeta.label;
  }
  if (packageName) {
    document.title = `${packageName} - 선택 공유`;
    const packageTitle = $("#packageTitle");
    if (packageTitle) packageTitle.textContent = packageName;
    const packageNamePreview = $("#packageNamePreview");
    if (packageNamePreview) packageNamePreview.textContent = "닉네임";
  }

  const picked = ids.map(id => songs.find(s => s.id === id)).filter(Boolean);

  const list = $("#shareSheets");
  list.innerHTML = "";
  const downloadSummary = $("#downloadSummary");
  if (downloadSummary) {
    downloadSummary.innerHTML = "";
    if (!picked.length) {
      downloadSummary.textContent = "공유된 악보 없음";
    } else {
      const wrap = document.createElement("div");
      wrap.className = "summary-inline";
      picked.forEach((s, i) => {
        const chip = document.createElement("span");
        chip.className = "summary-item";

        const num = document.createElement("span");
        num.className = "summary-num";
        num.textContent = String(i + 1);

        const title = document.createElement("span");
        title.className = "summary-text";
        title.textContent = s.title;

        chip.append(num, title);
        wrap.appendChild(chip);
      });
      downloadSummary.appendChild(wrap);
    }
  }

  if (picked.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sheet-item";
    empty.textContent = "선택된 악보가 없습니다. 목록 페이지에서 다시 선택해 주세요.";
    list.appendChild(empty);
  }

  for (let i = 0; i < picked.length; i += 1) {
    const song = picked[i];
    const item = document.createElement("div");
    item.className = "sheet-item";
    item.dataset.songId = song.id;

    const head = document.createElement("div");
    head.className = "sheet-head";
    const songDot = document.createElement("button");
    songDot.type = "button";
    songDot.className = "song-select-dot";
    songDot.dataset.songId = song.id;
    songDot.title = "곡 전체 선택";
    songDot.setAttribute("aria-label", "곡 전체 선택");
    songDot.addEventListener("click", () => {
      toggleSongSelection(song.id);
    });

    const title = document.createElement("h3");
    title.className = "sheet-title";
    title.textContent = `${i + 1}. ${song.title}`;
    head.append(songDot, title);
    item.appendChild(head);

    const pages = document.createElement("div");
    pages.className = "page-gallery";
    item.appendChild(pages);
    list.appendChild(item);

    await renderPdfPages(song, pages);
  }

  const btnDownloadAll = $("#btnDownloadAll");
  btnDownloadAll.addEventListener("click", async () => {
    if (!picked.length) return;
    if (!window.PDFLib) {
      alert("PDF 병합 라이브러리를 불러오지 못했어요.");
      return;
    }

    btnDownloadAll.disabled = true;
    const prevText = btnDownloadAll.textContent;
    btnDownloadAll.textContent = "병합 중...";

    try {
      const mergedPdf = await PDFLib.PDFDocument.create();
      for (const song of picked) {
        if (!song.pdfUrl) continue;
        const res = await fetch(song.pdfUrl, { cache: "no-store" });
        if (!res.ok) continue;
        const bytes = await res.arrayBuffer();
        const src = await PDFLib.PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(src, src.getPageIndices());
        pages.forEach((p) => mergedPdf.addPage(p));
      }

      if (mergedPdf.getPageCount() === 0) {
        alert("병합할 PDF가 없습니다.");
        return;
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const safePkg = sanitizeFilename(packageName);
      const filename = safePkg ? `${safePkg}_전체.pdf` : "shared-sheets-merged.pdf";
      if (isMobileViewport()) {
        const shareTitle = safePkg ? `${safePkg} 전체 PDF` : "공유 악보 전체";
        const shared = await sharePdfBlobMobile(blob, filename, shareTitle);
        if (!shared) {
          alert("이 기기/브라우저에서는 파일 공유를 지원하지 않아요.");
        }
      } else {
        forceDownloadBlob(blob, filename);
      }
    } catch (err) {
      console.error(err);
      alert("PDF 병합 중 오류가 발생했어요.");
    } finally {
      btnDownloadAll.disabled = false;
      btnDownloadAll.textContent = prevText;
    }
  });

  const btnPickSheets = $("#btnPickSheets");
  const btnDownloadPicked = $("#btnDownloadPicked");
  const btnSharePackageLink = $("#btnSharePackageLink");

  if (btnSharePackageLink) {
    btnSharePackageLink.addEventListener("click", async () => {
      const shareUrl = location.href;
      const shareTitle = packageName ? `악보 패키지: ${packageName}` : "공유 선택된 악보 목록";
      const shareText = packageName
        ? `${packageName} 패키지 링크입니다.\n${shareUrl}`
        : `공유된 악보 패키지 링크입니다.\n${shareUrl}`;
      const payload = {
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      };

      if (navigator.share) {
        try {
          await navigator.share(payload);
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
        }
      }

      navigator.clipboard?.writeText(shareUrl).then(() => {
        alert("공유 시트를 지원하지 않아 링크를 복사했어요.");
      }).catch(() => {
        prompt("복사해서 공유하세요:", shareUrl);
      });
    });
  }

  if (btnDownloadPicked) {
    btnDownloadPicked.addEventListener("click", async () => {
      if (!window.PDFLib) {
        alert("PDF 병합 라이브러리를 불러오지 못했어요.");
        return;
      }
      if (getSelectedPageTotal() <= 0) return;

      btnDownloadPicked.disabled = true;
      const prevText = btnDownloadPicked.textContent;
      btnDownloadPicked.textContent = "병합 중...";

      try {
        const mergedPdf = await PDFLib.PDFDocument.create();

        for (const song of picked) {
          const selectedSet = shareState.selectedPages.get(song.id);
          if (!selectedSet || selectedSet.size === 0 || !song.pdfUrl) continue;

          const res = await fetch(song.pdfUrl, { cache: "no-store" });
          if (!res.ok) continue;
          const bytes = await res.arrayBuffer();
          const src = await PDFLib.PDFDocument.load(bytes);

          const indices = Array.from(selectedSet)
            .sort((a, b) => a - b)
            .map((n) => n - 1)
            .filter((idx) => idx >= 0 && idx < src.getPageCount());

          if (!indices.length) continue;
          const pages = await mergedPdf.copyPages(src, indices);
          pages.forEach((p) => mergedPdf.addPage(p));
        }

        if (mergedPdf.getPageCount() === 0) {
          alert("선택된 PDF 페이지가 없습니다.");
          return;
        }

        const mergedBytes = await mergedPdf.save();
        const blob = new Blob([mergedBytes], { type: "application/pdf" });
        const safePkg = sanitizeFilename(packageName);
        const filename = safePkg ? `${safePkg}_선택.pdf` : "selected-sheets-merged.pdf";
        if (isMobileViewport()) {
          const shareTitle = safePkg ? `${safePkg} 선택 PDF` : "선택 악보";
          const shared = await sharePdfBlobMobile(blob, filename, shareTitle);
          if (!shared) {
            alert("이 기기/브라우저에서는 파일 공유를 지원하지 않아요.");
          }
        } else {
          forceDownloadBlob(blob, filename);
        }
      } catch (err) {
        console.error(err);
        alert("선택한 악보 병합 중 오류가 발생했어요.");
      } finally {
        btnDownloadPicked.disabled = false;
        btnDownloadPicked.textContent = prevText;
      }
    });
  }

  btnPickSheets.addEventListener("click", () => {
    shareState.selectMode = !shareState.selectMode;
    if (!shareState.selectMode) {
      shareState.selectedPages.clear();
    }
    document.body.classList.toggle("sheet-select-mode", shareState.selectMode);
    btnPickSheets.textContent = shareState.selectMode ? "선택 취소" : "악보 선택";
    refreshSelectionUI();
  });
}

async function renderPdfPages(song, container) {
  if (!window.pdfjsLib || !song.pdfUrl) {
    const txt = document.createElement("div");
    txt.className = "sheet-empty";
    txt.textContent = "PDF를 불러오지 못했습니다.";
    container.appendChild(txt);
    return;
  }

  try {
    const loadingTask = pdfjsLib.getDocument(song.pdfUrl);
    const doc = await loadingTask.promise;
    shareState.pageCounts.set(song.id, doc.numPages);

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const pageBox = document.createElement("div");
      pageBox.className = "page-box";
      pageBox.dataset.songId = song.id;
      pageBox.dataset.pageNum = String(pageNum);

      const label = document.createElement("div");
      label.className = "page-label";
      label.textContent = `${pageNum}페이지`;

      const canvas = document.createElement("canvas");
      canvas.className = "page-canvas";

      const pageDot = document.createElement("button");
      pageDot.type = "button";
      pageDot.className = "page-select-dot";
      pageDot.dataset.songId = song.id;
      pageDot.dataset.pageNum = String(pageNum);
      pageDot.title = `${pageNum}페이지 선택`;
      pageDot.setAttribute("aria-label", `${pageNum}페이지 선택`);
      pageDot.addEventListener("click", () => {
        togglePageSelection(song.id, pageNum);
      });

      const onPagePick = () => {
        if (!shareState.selectMode) return;
        togglePageSelection(song.id, pageNum);
      };
      pageBox.addEventListener("click", onPagePick);
      canvas.addEventListener("click", (e) => {
        e.stopPropagation();
        onPagePick();
      });

      pageBox.append(label, canvas, pageDot);
      container.appendChild(pageBox);

      const page = await doc.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = 150;
      const scale = targetWidth / base.width;
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
    refreshSelectionUI(song.id);
  } catch {
    const txt = document.createElement("div");
    txt.className = "sheet-empty";
    txt.textContent = "PDF 렌더링 실패";
    container.appendChild(txt);
  }
}

function getSelectedSet(songId) {
  if (!shareState.selectedPages.has(songId)) {
    shareState.selectedPages.set(songId, new Set());
  }
  return shareState.selectedPages.get(songId);
}

function toggleSongSelection(songId) {
  const total = shareState.pageCounts.get(songId) || 0;
  if (total <= 0) return;
  const set = getSelectedSet(songId);
  if (set.size === total) {
    set.clear();
  } else {
    set.clear();
    for (let i = 1; i <= total; i += 1) set.add(i);
  }
  refreshSelectionUI(songId);
}

function togglePageSelection(songId, pageNum) {
  const set = getSelectedSet(songId);
  if (set.has(pageNum)) set.delete(pageNum);
  else set.add(pageNum);
  refreshSelectionUI(songId);
}

function refreshSelectionUI(targetSongId = null) {
  const songIds = targetSongId ? [targetSongId] : Array.from(shareState.pageCounts.keys());
  songIds.forEach((songId) => {
    const total = shareState.pageCounts.get(songId) || 0;
    const selected = getSelectedSet(songId);
    const songDot = document.querySelector(`.song-select-dot[data-song-id="${songId}"]`);
    if (songDot) {
      songDot.classList.toggle("active", total > 0 && selected.size === total);
      songDot.classList.toggle("partial", selected.size > 0 && selected.size < total);
    }

    const pageDots = document.querySelectorAll(`.page-select-dot[data-song-id="${songId}"]`);
    pageDots.forEach((dot) => {
      const pageNum = Number(dot.dataset.pageNum || "0");
      const isSelected = selected.has(pageNum);
      dot.classList.toggle("active", isSelected);
      const pageBox = dot.closest(".page-box");
      if (pageBox) pageBox.classList.toggle("selected", isSelected);
    });
  });
  updateDownloadPickedUI();
}

init().catch(console.error);
