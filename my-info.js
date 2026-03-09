/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);
const KOR_INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];

let myInfoPasswordUpdating = false;
const UI_THEME_STORAGE_KEY = "scorebox-ui-theme";

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

function setMyInfoStatus(message = "", isError = false) {
  const el = $("#myInfoStatus");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", !!isError);
}

function validateMyInfoPassword(password = "") {
  const value = String(password || "");
  if (!value) return "새 비밀번호를 입력해 주세요.";
  if (value.length < 5 || value.length > 15) return "비밀번호는 5~15자로 입력해 주세요.";
  if (!/^[A-Za-z0-9!@#]+$/.test(value)) return "비밀번호는 영문/숫자/!@#만 사용할 수 있어요.";
  return "";
}

function matchesPackagesQuery(item, query) {
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
  if (v === "high") return "고등부";
  if (v === "middle") return "중등부";
  return "기타";
}

function normalizeVaultKey(vault = "") {
  const v = String(vault || "").toLowerCase();
  if (v === "high" || v === "middle" || v === "all") return v;
  return "all";
}

function getRoleLabel(role = "") {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "관리자";
  if (value === "high") return "고등부";
  if (value === "middle") return "중등부";
  if (value === "all") return "기타";
  return "-";
}

function getStoredTheme() {
  if (window.ScoreboxTheme?.getStoredTheme) {
    return window.ScoreboxTheme.getStoredTheme();
  }
  try {
    const value = localStorage.getItem(UI_THEME_STORAGE_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyUiTheme(theme = "light") {
  const nextTheme = theme === "dark" ? "dark" : "light";
  if (window.ScoreboxTheme?.apply) {
    window.ScoreboxTheme.apply(nextTheme);
  } else {
    document.documentElement.dataset.uiTheme = nextTheme;
    document.body.dataset.uiTheme = nextTheme;
  }

  const toggleBtn = $("#btnThemeToggle");
  const label = $("#themeToggleLabel");
  if (toggleBtn) {
    const isDark = nextTheme === "dark";
    toggleBtn.classList.toggle("is-dark", isDark);
    toggleBtn.setAttribute("aria-pressed", String(isDark));
    toggleBtn.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
  }
  if (label) {
    label.textContent = nextTheme === "dark" ? "다크" : "라이트";
  }
}

function saveUiTheme(theme = "light") {
  if (window.ScoreboxTheme?.set) {
    window.ScoreboxTheme.set(theme);
    return;
  }
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, theme === "dark" ? "dark" : "light");
  } catch {}
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

async function renderPackages(query = "") {
  const list = $("#myPackagesList");
  if (!list) return;
  const items = (await loadMyPackages()).filter((item) => matchesPackagesQuery(item, query));

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
      await renderPackages($("#myPackagesSearch")?.value || "");
    });

    actions.append(openBtn, shareBtn, delBtn);
    row.append(meta, actions);
    list.appendChild(row);
  });
}

async function init() {
  if (!window.SB?.isConfigured()) return;
  const client = window.SB.getClient();
  if (!client) return;

  const { data } = await client.auth.getSession();
  const session = data?.session || null;
  if (!session) {
    const next = `${location.pathname}${location.search}`;
    location.replace(`./auth.html?next=${encodeURIComponent(next)}`);
    return;
  }

  const nickname = String(
    session.user?.user_metadata?.nickname ||
    session.user?.email?.split("@")[0] ||
    "-"
  );
  const email = String(session.user?.email || "-");
  const pageTitle = nickname && nickname !== "-" ? `${nickname}님의 정보` : "나의 정보";
  const packagesTitle = nickname && nickname !== "-" ? `${nickname}님의 콘티` : "나의 콘티";

  $("#myInfoPageTitle").textContent = pageTitle;
  $("#myInfoPackagesTitle").textContent = packagesTitle;
  document.title = pageTitle;
  $("#myInfoNickname").textContent = nickname;
  $("#myInfoEmail").textContent = email;
  applyUiTheme(getStoredTheme());

  try {
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    $("#myInfoRole").textContent = getRoleLabel(profile?.role);
  } catch {
    $("#myInfoRole").textContent = "-";
  }

  $("#btnMyInfoChangePassword")?.addEventListener("click", async () => {
    if (myInfoPasswordUpdating) return;
    const pw = String($("#myInfoNewPassword")?.value || "");
    const pw2 = String($("#myInfoNewPasswordConfirm")?.value || "");
    const pwErr = validateMyInfoPassword(pw);
    if (pwErr) {
      setMyInfoStatus(pwErr, true);
      return;
    }
    if (!pw2) {
      setMyInfoStatus("비밀번호 확인을 입력해 주세요.", true);
      return;
    }
    if (pw !== pw2) {
      setMyInfoStatus("비밀번호와 비밀번호 확인이 일치하지 않습니다.", true);
      return;
    }

    myInfoPasswordUpdating = true;
    setMyInfoStatus("비밀번호 변경 중...");
    try {
      const { error } = await client.auth.updateUser({ password: pw });
      if (error) {
        setMyInfoStatus(error.message || "비밀번호 변경에 실패했습니다.", true);
        return;
      }
      $("#myInfoNewPassword").value = "";
      $("#myInfoNewPasswordConfirm").value = "";
      setMyInfoStatus("비밀번호가 변경되었습니다.");
    } catch (err) {
      console.error(err);
      setMyInfoStatus("비밀번호 변경 중 오류가 발생했습니다.", true);
    } finally {
      myInfoPasswordUpdating = false;
    }
  });

  $("#btnMyInfoLogout")?.addEventListener("click", async () => {
    const ok = confirm("로그아웃 하시겠습니까?");
    if (!ok) return;
    try {
      await client.auth.signOut();
    } catch {}
    location.replace("./auth.html");
  });

  $("#btnThemeToggle")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.uiTheme === "dark" ? "light" : "dark";
    applyUiTheme(nextTheme);
    saveUiTheme(nextTheme);
  });

  const searchInput = $("#myPackagesSearch");
  const clearBtn = $("#btnClearMyPackagesSearch");
  const syncClear = () => {
    const has = (searchInput?.value || "").trim().length > 0;
    clearBtn?.classList.toggle("hidden", !has);
  };

  searchInput?.addEventListener("input", async () => {
    syncClear();
    await renderPackages(searchInput.value || "");
  });
  clearBtn?.addEventListener("click", async () => {
    if (!searchInput) return;
    searchInput.value = "";
    syncClear();
    searchInput.focus();
    await renderPackages("");
  });

  syncClear();
  await renderPackages("");
}

init().catch((err) => {
  console.error("my info page 초기화 실패:", err);
  setMyInfoStatus("나의 정보를 불러오는 중 오류가 발생했습니다.", true);
});
