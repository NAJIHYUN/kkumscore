/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);

const KOR_INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];

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

function matchesQuery(item, query) {
  const q = normalize(query);
  if (!q) return true;
  const name = normalize(item?.name || "");
  const vault = normalize(item?.vaultLabel || "");
  const merged = `${name} ${vault}`;
  if (/[ㄱ-ㅎ]/.test(q)) {
    return `${getChosung(name)}${getChosung(vault)}`.includes(q.replace(/\s+/g, ""));
  }
  return name.includes(q) || vault.includes(q) || merged.includes(q);
}

function getVaultLabel(vault = "") {
  const v = String(vault || "").toLowerCase();
  if (v === "high") return "☁️ 고등부";
  if (v === "middle") return "😎 중등부";
  return "📂 기타";
}

function normalizeVaultKey(vault = "") {
  const v = String(vault || "").toLowerCase();
  if (v === "high" || v === "middle" || v === "all") return v;
  return "all";
}

async function getSession() {
  if (!window.SB?.isConfigured()) return null;
  const client = window.SB.getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}

async function loadMyPackages() {
  const loadLocal = (vault = "all") => {
    try {
      const raw = JSON.parse(localStorage.getItem(`scorebox_vault_${vault}`) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map((item, idx) => ({
        id: `local-${vault}-${idx}-${String(item?.createdAt || "")}`,
        name: item?.name || "이름 없는 콘티",
        url: item?.url || "",
        vault,
        vaultLabel: getVaultLabel(vault),
        createdAt: item?.createdAt || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  };
  const localItems = [...loadLocal("high"), ...loadLocal("middle"), ...loadLocal("all")];

  const client = window.SB?.getClient?.();
  if (!client) return localItems;
  const { data, error } = await client
    .from("packages")
    .select("id, name, url, vault, created_at")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return localItems;
  const remoteItems = data.map((row) => ({
    id: row.id,
    name: row.name || "이름 없는 콘티",
    url: row.url || "",
    vault: row.vault || "all",
    vaultLabel: getVaultLabel(row.vault),
    createdAt: row.created_at,
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

async function deletePackage(id) {
  const client = window.SB?.getClient?.();
  if (!client || !id) return false;
  const { error } = await client.from("packages").delete().eq("id", id);
  return !error;
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

async function renderList(query = "") {
  const list = $("#myPackagesList");
  if (!list) return;
  const items = (await loadMyPackages()).filter((item) => matchesQuery(item, query));

  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "vault-empty";
    empty.textContent = "생성한 콘티가 없습니다.";
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
    vaultEl.className = `vault-item-nickname vault-label-${normalizeVaultKey(item.vault)}`;
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
    openBtn.addEventListener("click", () => window.open(item.url, "_blank"));

    const shareBtn = document.createElement("button");
    shareBtn.className = "btn vault-btn-share";
    shareBtn.textContent = "공유";
    shareBtn.addEventListener("click", async () => {
      await shareLink(item.url, item.name);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn vault-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`${item.name}를 삭제할까요? 삭제된 콘티는 복구가 불가합니다.`)) return;
      const ok = await deletePackage(item.id);
      if (!ok) {
        alert("삭제에 실패했어요.");
        return;
      }
      await renderList($("#myPackagesSearch")?.value || "");
    });

    actions.append(openBtn, shareBtn, delBtn);
    row.append(meta, actions);
    list.appendChild(row);
  });
}

async function init() {
  const session = await getSession();
  if (!session) {
    const next = `${location.pathname}${location.search}`;
    location.replace(`./auth.html?next=${encodeURIComponent(next)}`);
    return;
  }

  const searchInput = $("#myPackagesSearch");
  const clearBtn = $("#btnClearMyPackagesSearch");

  const syncClear = () => {
    const has = (searchInput?.value || "").trim().length > 0;
    clearBtn?.classList.toggle("hidden", !has);
  };

  searchInput?.addEventListener("input", async () => {
    syncClear();
    await renderList(searchInput.value || "");
  });
  clearBtn?.addEventListener("click", async () => {
    if (!searchInput) return;
    searchInput.value = "";
    syncClear();
    searchInput.focus();
    await renderList("");
  });

  syncClear();
  await renderList("");
}

init().catch((err) => {
  console.error(err);
});
