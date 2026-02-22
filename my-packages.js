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

async function getSession() {
  if (!window.SB?.isConfigured()) return null;
  const client = window.SB.getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}

async function loadMyPackages() {
  const client = window.SB?.getClient?.();
  if (!client) return [];
  const { data, error } = await client
    .from("packages")
    .select("id, name, url, vault, created_at")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: row.id,
    name: row.name || "이름 없는 패키지",
    url: row.url || "",
    vault: row.vault || "all",
    vaultLabel: getVaultLabel(row.vault),
    createdAt: row.created_at,
  }));
}

async function deletePackage(id) {
  const client = window.SB?.getClient?.();
  if (!client || !id) return false;
  const { error } = await client.from("packages").delete().eq("id", id);
  return !error;
}

async function shareLink(url, name = "패키지") {
  const payload = {
    title: `패키지: ${name}`,
    text: `${name} 패키지 링크입니다.`,
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
    empty.textContent = "생성한 패키지가 없습니다.";
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
    vaultEl.className = "vault-item-nickname";
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
      if (!confirm("정말 삭제할까요?")) return;
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
