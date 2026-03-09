/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);

const KOR_INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];

const state = {
  allItems: [],
  activeVaults: new Set(),
};

function normalizeVaultKey(vault = "") {
  const v = String(vault || "").trim().toLowerCase();
  if (v === "high") return "high";
  if (v === "middle") return "middle";
  if (v === "all" || v === "etc") return "all";
  return "all";
}

function normalize(str = "") {
  return String(str).normalize("NFC").trim().toLowerCase();
}

function getChosung(str = "") {
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

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function getVaultLabel(vault = "") {
  const v = normalizeVaultKey(vault);
  if (v === "high") return "고등부";
  if (v === "middle") return "중등부";
  return "기타";
}

function matchesQuery(item, query = "") {
  const q = normalize(query);
  if (!q) return true;
  const name = normalize(item?.name || "");
  const vault = normalize(item?.vaultLabel || "");
  const songTitles = Array.isArray(item?.songTitles) ? item.songTitles : [];
  const songsText = songTitles.map((title) => normalize(title)).join(" ");
  const merged = `${name} ${vault} ${songsText}`.trim();
  if (/[ㄱ-ㅎ]/.test(q)) {
    const choSongs = songTitles.map((title) => getChosung(title)).join("");
    return `${getChosung(name)}${getChosung(vault)}${choSongs}`.includes(q.replace(/\s+/g, ""));
  }
  return name.includes(q) || vault.includes(q) || merged.includes(q);
}

function sortByCreated(items = [], sort = "latest") {
  const ascending = sort === "oldest";
  const arr = [...items];
  arr.sort((a, b) => {
    const ta = new Date(a?.createdAt || 0).getTime() || 0;
    const tb = new Date(b?.createdAt || 0).getTime() || 0;
    return ascending ? ta - tb : tb - ta;
  });
  return arr;
}

function loadLocalPackagesByVault(vault = "all") {
  try {
    const raw = JSON.parse(localStorage.getItem(`scorebox_vault_${vault}`) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((item, idx) => ({
      id: `local-${vault}-${idx}-${String(item?.createdAt || "")}`,
      name: String(item?.name || "이름 없는 콘티"),
      url: String(item?.url || ""),
      vault: normalizeVaultKey(vault),
      vaultLabel: getVaultLabel(vault),
      createdAt: item?.createdAt || new Date().toISOString(),
      songTitles: parseSongTitlesFromPackageUrl(item?.url || ""),
      source: "local",
    }));
  } catch {
    return [];
  }
}

function parseSongTitlesFromPayload(payload = "") {
  try {
    const normalized = String(payload || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const json = typeof TextDecoder !== "undefined"
      ? new TextDecoder().decode(bytes)
      : decodeURIComponent(escape(binary));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item?.title || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseSongTitlesFromPackageUrl(url = "") {
  try {
    const parsed = new URL(String(url || ""), location.href);
    return parseSongTitlesFromPayload(parsed.searchParams.get("data") || "");
  } catch {
    return [];
  }
}

async function loadAllPackages() {
  const localItems = [
    ...loadLocalPackagesByVault("high"),
    ...loadLocalPackagesByVault("middle"),
    ...loadLocalPackagesByVault("all"),
  ];

  if (window.SB?.isConfigured()) {
    try {
      const client = window.SB.getClient();
      if (client) {
        const { data, error } = await client
          .from("packages")
          .select("id, name, url, vault, created_at");

        if (!error && Array.isArray(data)) {
          const remoteItems = data.map((row) => ({
            id: row.id,
            name: row.name || "이름 없는 콘티",
            url: row.url || "",
            vault: normalizeVaultKey(row.vault),
            vaultLabel: getVaultLabel(row.vault),
            createdAt: row.created_at,
            songTitles: parseSongTitlesFromPackageUrl(row.url || ""),
            source: "remote",
          }));
          const keyOf = (x) => `${x.vault}|${x.name}|${x.url}`;
          const seen = new Set(remoteItems.map(keyOf));
          const merged = [...remoteItems];
          localItems.forEach((item) => {
            const key = keyOf(item);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(item);
          });
          return merged;
        }
      }
    } catch (err) {
      console.error("songlist packages 로드 오류:", err);
    }
  }

  return localItems;
}

async function shareLink(url, name = "콘티") {
  const payload = {
    title: `콘티: ${name}`,
    text: `${name} 콘티 링크입니다.`,
    url,
  };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert("링크를 복사했어요.");
  } catch {
    prompt("복사해서 사용하세요:", url);
  }
}

function renderList() {
  const list = $("#songlistList");
  const searchInput = $("#songlistSearch");
  const sortSelect = $("#songlistSort");
  if (!list) return;

  const query = searchInput?.value || "";
  const sort = sortSelect?.value || "latest";
  const items = sortByCreated(
    state.allItems
      .filter((item) => {
        if (!state.activeVaults.size) return true;
        return state.activeVaults.has(normalizeVaultKey(item?.vault));
      })
      .filter((item) => matchesQuery(item, query)),
    sort
  );

  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "vault-empty";
    empty.textContent = "생성된 콘티가 없습니다.";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "vault-item";

    const meta = document.createElement("div");
    meta.className = "vault-item-meta";

    const name = document.createElement("div");
    name.className = "vault-item-name";

    const packageNameEl = document.createElement("span");
    packageNameEl.className = "vault-package-name";
    packageNameEl.textContent = item.name;

    const vaultEl = document.createElement("span");
    vaultEl.className = `vault-item-nickname songlist-vault-label songlist-vault-label-${normalizeVaultKey(item.vault)}`;
    vaultEl.textContent = item.vaultLabel;

    name.append(packageNameEl, vaultEl);

    const date = document.createElement("div");
    date.className = "vault-item-date";
    date.textContent = formatDate(item.createdAt);

    meta.append(name, date);

    const actions = document.createElement("div");
    actions.className = "vault-item-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "btn vault-btn-open";
    openBtn.textContent = "열기";
    openBtn.addEventListener("click", () => {
      if (!item.url) return;
      window.open(item.url, "_blank");
    });

    const shareBtn = document.createElement("button");
    shareBtn.className = "btn vault-btn-share";
    shareBtn.textContent = "공유";
    shareBtn.addEventListener("click", async () => {
      if (!item.url) return;
      await shareLink(item.url, item.name);
    });

    actions.append(openBtn, shareBtn);
    row.append(meta, actions);
    list.appendChild(row);
  });
}

function syncVaultFilterButtons() {
  document.querySelectorAll(".songlist-vault-btn[data-vault-filter]").forEach((btn) => {
    const key = normalizeVaultKey(btn.dataset.vaultFilter || "");
    const active = state.activeVaults.has(key);
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

async function init() {
  state.allItems = await loadAllPackages();
  syncVaultFilterButtons();
  renderList();

  $("#songlistSearch")?.addEventListener("input", () => {
    renderList();
  });
  $("#songlistSort")?.addEventListener("change", () => {
    renderList();
  });
  document.querySelectorAll(".songlist-vault-btn[data-vault-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = normalizeVaultKey(btn.dataset.vaultFilter || "");
      if (!key) return;
      if (state.activeVaults.has(key)) state.activeVaults.delete(key);
      else state.activeVaults.add(key);
      syncVaultFilterButtons();
      renderList();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
  });
});
