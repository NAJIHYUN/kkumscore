/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);
const KOR_INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];

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

function loadVaultLocal(vault) {
  try {
    return JSON.parse(localStorage.getItem(`scorebox_vault_${vault}`) || "[]");
  } catch {
    return [];
  }
}

function saveVaultLocal(vault, items) {
  localStorage.setItem(`scorebox_vault_${vault}`, JSON.stringify(items));
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

function normalize(str = "") {
  return String(str).normalize("NFC").trim().toLowerCase();
}

function matchesVaultQuery(item, nickname, query) {
  const q = normalize(query);
  if (!q) return true;

  const name = normalize(item?.name || "");
  const nick = normalize(nickname || "");
  const merged = `${name}_${nick}`.trim();

  const hasJamo = /[ㄱ-ㅎ]/.test(q);
  if (hasJamo) {
    const cName = getChosung(name);
    const cNick = getChosung(nick);
    const cMerged = `${cName}${cNick}`;
    return cMerged.includes(q.replace(/\s+/g, ""));
  }

  return (
    name.includes(q) ||
    nick.includes(q) ||
    merged.includes(q)
  );
}

async function getSupabaseSession() {
  if (!window.SB?.isConfigured()) return null;
  const client = window.SB.getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}

async function loadVault(vault) {
  if (window.SB?.isConfigured()) {
    try {
      const client = window.SB.getClient();
      const session = await getSupabaseSession();
      if (client && session?.user?.id) {
        const { data, error } = await client
          .from("packages")
          .select("id, name, url, created_at")
          .eq("vault", vault)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          return data.map((row) => ({
            id: row.id,
            name: row.name,
            url: row.url,
            createdAt: row.created_at,
            source: "remote",
          }));
        }
      }
    } catch (err) {
      console.error("보관함 로드 오류:", err);
    }
  }

  return loadVaultLocal(vault).map((x) => ({ ...x, source: "local" }));
}

async function deleteVaultItem(vault, item) {
  if (item?.source === "remote" && item.id && window.SB?.isConfigured()) {
    try {
      const client = window.SB.getClient();
      if (client) {
        const { error } = await client.from("packages").delete().eq("id", item.id);
        if (!error) return;
      }
    } catch (err) {
      console.error("보관함 항목 삭제 오류:", err);
    }
  }

  const next = loadVaultLocal(vault);
  const localIdx = next.findIndex((x) => (
    String(x?.name || "") === String(item?.name || "") &&
    String(x?.url || "") === String(item?.url || "") &&
    String(x?.createdAt || "") === String(item?.createdAt || "")
  ));
  if (localIdx >= 0) next.splice(localIdx, 1);
  saveVaultLocal(vault, next);
}

async function clearVault(vault) {
  if (window.SB?.isConfigured()) {
    try {
      const client = window.SB.getClient();
      if (client) {
        const { error } = await client.from("packages").delete().eq("vault", vault);
        if (!error) return;
      }
    } catch (err) {
      console.error("보관함 전체 삭제 오류:", err);
    }
  }
  saveVaultLocal(vault, []);
}

function getDisplayNickname(session) {
  const metaNickname = String(session?.user?.user_metadata?.nickname || "").trim();
  if (metaNickname) return metaNickname;
  const email = String(session?.user?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "닉네임";
}

async function renderVault(vault, nickname = "닉네임", query = "") {
  const list = $("#vaultList");
  if (!list) return;
  const allItems = await loadVault(vault);
  const items = allItems.filter((item) => matchesVaultQuery(item, nickname, query));

  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "vault-empty";
    empty.textContent = "저장된 패키지가 없습니다.";
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
    const baseName = item.name || "이름 없는 패키지";
    const packageNameEl = document.createElement("span");
    packageNameEl.className = "vault-package-name";
    packageNameEl.textContent = baseName;

    const nicknameEl = document.createElement("span");
    nicknameEl.className = "vault-item-nickname";
    nicknameEl.textContent = nickname;

    name.append(packageNameEl, nicknameEl);

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
      window.open(item.url, "_blank");
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn vault-btn-copy";
    copyBtn.textContent = "복사";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.url);
        alert("링크를 복사했어요.");
      } catch {
        prompt("복사해서 사용하세요:", item.url);
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn vault-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      if (!confirm("정말 삭제할까요?")) return;
      await deleteVaultItem(vault, item);
      await renderVault(vault, nickname, query);
    });

    actions.append(openBtn, copyBtn, delBtn);
    row.append(meta, actions);
    list.appendChild(row);
  });
}

async function init() {
  const root = document.body;
  const vault = root.dataset.vault || "all";
  const title = root.dataset.vaultTitle || "보관함";
  const session = await getSupabaseSession();
  const nickname = getDisplayNickname(session);
  const vaultIcon = vault === "high" ? "☁️" : vault === "middle" ? "😎" : "📂";
  const searchInput = $("#vaultSearch");
  const clearSearchBtn = $("#btnClearVaultSearch");

  const titleEl = $("#vaultTitle");
  if (titleEl) titleEl.textContent = `${vaultIcon} ${title}`;
  document.title = `${title} 보관함`;

  await renderVault(vault, nickname, searchInput?.value || "");

  const syncClearButton = () => {
    const hasText = (searchInput?.value || "").trim().length > 0;
    clearSearchBtn?.classList.toggle("hidden", !hasText);
  };

  searchInput?.addEventListener("input", async () => {
    syncClearButton();
    await renderVault(vault, nickname, searchInput.value || "");
  });
  clearSearchBtn?.addEventListener("click", async () => {
    if (!searchInput) return;
    searchInput.value = "";
    syncClearButton();
    searchInput.focus();
    await renderVault(vault, nickname, "");
  });
  syncClearButton();

  $("#btnClearVault")?.addEventListener("click", async () => {
    if (!confirm("보관함 목록을 모두 삭제할까요?")) return;
    await clearVault(vault);
    await renderVault(vault, nickname, searchInput?.value || "");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => console.error(err));
});
