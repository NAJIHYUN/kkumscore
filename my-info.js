/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);
const KOR_INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];
const ANIMAL_EMOJIS = ["🐶", "🐱", "🐰", "🦊", "🐻", "🐼", "🐯", "🦁", "🐨", "🐷", "🐹", "🐵"];

let myInfoPasswordUpdating = false;
let myInfoAvatarUploading = false;
const UI_THEME_STORAGE_KEY = "scorebox-ui-theme";
const AVATAR_CROP_OUTPUT_SIZE = 512;
const myInfoAvatarCropState = {
  file: null,
  image: null,
  objectUrl: "",
  naturalWidth: 0,
  naturalHeight: 0,
  stageSize: 0,
  cropInset: 0,
  cropSize: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  pointerId: null,
  dragStartX: 0,
  dragStartY: 0,
  dragOriginX: 0,
  dragOriginY: 0,
};

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

function getStableAnimalEmoji(seed = "") {
  const source = String(seed || "").trim();
  if (!source) return "🐶";
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return ANIMAL_EMOJIS[hash % ANIMAL_EMOJIS.length] || "🐶";
}

function setMyInfoAvatar(avatarImageUrl = "", seed = "") {
  const avatar = $("#myInfoAvatarButton");
  if (!avatar) return;
  const imageUrl = String(avatarImageUrl || "").trim();
  avatar.innerHTML = imageUrl
    ? `<img src="${imageUrl.replaceAll('"', "&quot;")}" alt="" />`
    : `<span>${getStableAnimalEmoji(seed)}</span>`;
}

function setMyInfoSummary(nickname = "-", email = "-") {
  const nicknameEl = $("#myInfoSummaryNickname");
  const emailEl = $("#myInfoSummaryEmail");
  if (nicknameEl) nicknameEl.textContent = nickname || "-";
  if (emailEl) emailEl.textContent = email || "-";
}

function closeMyInfoAvatarCropModal() {
  $("#myInfoAvatarCropModal")?.classList.add("hidden");
}

function openMyInfoAvatarCropModal() {
  $("#myInfoAvatarCropModal")?.classList.remove("hidden");
}

function cleanupMyInfoAvatarCropState() {
  if (myInfoAvatarCropState.objectUrl) {
    URL.revokeObjectURL(myInfoAvatarCropState.objectUrl);
  }
  myInfoAvatarCropState.file = null;
  myInfoAvatarCropState.image = null;
  myInfoAvatarCropState.objectUrl = "";
  myInfoAvatarCropState.naturalWidth = 0;
  myInfoAvatarCropState.naturalHeight = 0;
  myInfoAvatarCropState.stageSize = 0;
  myInfoAvatarCropState.cropInset = 0;
  myInfoAvatarCropState.cropSize = 0;
  myInfoAvatarCropState.scale = 1;
  myInfoAvatarCropState.offsetX = 0;
  myInfoAvatarCropState.offsetY = 0;
  myInfoAvatarCropState.dragging = false;
  myInfoAvatarCropState.pointerId = null;
  const imageEl = $("#myInfoAvatarCropImage");
  if (imageEl) {
    imageEl.src = "";
    imageEl.classList.add("hidden");
    imageEl.style.width = "";
    imageEl.style.height = "";
    imageEl.style.left = "";
    imageEl.style.top = "";
  }
}

function clampMyInfoAvatarCropPosition() {
  const state = myInfoAvatarCropState;
  const displayWidth = state.naturalWidth * state.scale;
  const displayHeight = state.naturalHeight * state.scale;
  const frameStart = state.cropInset;
  const frameEnd = state.cropInset + state.cropSize;
  const minOffsetX = Math.min(frameStart, frameEnd - displayWidth);
  const minOffsetY = Math.min(frameStart, frameEnd - displayHeight);
  state.offsetX = Math.min(frameStart, Math.max(minOffsetX, state.offsetX));
  state.offsetY = Math.min(frameStart, Math.max(minOffsetY, state.offsetY));
}

function syncMyInfoAvatarCropPreview() {
  const imageEl = $("#myInfoAvatarCropImage");
  const state = myInfoAvatarCropState;
  if (!imageEl || !state.image) return;
  clampMyInfoAvatarCropPosition();
  imageEl.classList.remove("hidden");
  imageEl.style.width = `${state.naturalWidth * state.scale}px`;
  imageEl.style.height = `${state.naturalHeight * state.scale}px`;
  imageEl.style.left = `${state.offsetX}px`;
  imageEl.style.top = `${state.offsetY}px`;
}

async function createMyInfoAvatarCroppedBlob() {
  const state = myInfoAvatarCropState;
  if (!state.image || !state.cropSize) throw new Error("프로필 이미지를 자를 수 없습니다.");
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CROP_OUTPUT_SIZE;
  canvas.height = AVATAR_CROP_OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 캔버스를 만들 수 없습니다.");
  const scale = state.scale || 1;
  const sourceX = Math.max(0, (state.cropInset - state.offsetX) / scale);
  const sourceY = Math.max(0, (state.cropInset - state.offsetY) / scale);
  const sourceSize = Math.min(
    state.naturalWidth - sourceX,
    state.naturalHeight - sourceY,
    state.cropSize / scale,
  );
  if (!(sourceSize > 0)) {
    throw new Error("프로필 이미지 자르기 범위를 계산하지 못했습니다.");
  }
  ctx.drawImage(
    state.image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_CROP_OUTPUT_SIZE,
    AVATAR_CROP_OUTPUT_SIZE,
  );
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("프로필 이미지를 저장 형식으로 만들지 못했습니다."));
    }, "image/jpeg", 0.92);
  });
}

async function openMyInfoAvatarCropper(file) {
  const imageEl = $("#myInfoAvatarCropImage");
  const stage = $("#myInfoAvatarCropStage");
  if (!imageEl || !stage || !file) return;
  cleanupMyInfoAvatarCropState();
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();

  const state = myInfoAvatarCropState;
  state.file = file;
  state.image = image;
  state.objectUrl = objectUrl;
  state.naturalWidth = image.naturalWidth || image.width;
  state.naturalHeight = image.naturalHeight || image.height;
  state.stageSize = stage.clientWidth || 280;
  state.cropInset = 14;
  state.cropSize = Math.max(state.stageSize - state.cropInset * 2, 1);
  state.scale = Math.max(state.cropSize / state.naturalWidth, state.cropSize / state.naturalHeight);
  state.offsetX = state.cropInset + (state.cropSize - state.naturalWidth * state.scale) / 2;
  state.offsetY = state.cropInset + (state.cropSize - state.naturalHeight * state.scale) / 2;

  imageEl.src = objectUrl;
  syncMyInfoAvatarCropPreview();
  openMyInfoAvatarCropModal();
}

function validateMyInfoPassword(password = "") {
  const value = String(password || "");
  if (!value) return "새 비밀번호를 입력해 주세요.";
  if (value.length < 5 || value.length > 15) return "비밀번호는 5~15자로 입력해 주세요.";
  if (!/^[A-Za-z0-9!@#]+$/.test(value)) return "비밀번호는 영문/숫자/!@#만 사용할 수 있어요.";
  return "";
}

function matchesSongsQuery(item, query) {
  const q = normalize(query);
  if (!q) return true;
  const title = normalize(item?.title || "");
  const artist = normalize(item?.artist || "");
  const key = normalize(item?.key || "");
  const merged = `${title} ${artist} ${key}`.trim();
  if (/[ㄱ-ㅎ]/.test(q)) {
    return `${getChosung(title)}${getChosung(artist)}`.includes(q.replace(/\s+/g, ""));
  }
  return title.includes(q) || artist.includes(q) || key.includes(q) || merged.includes(q);
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

function buildAuthPageUrl() {
  const next = `${location.pathname}${location.search}`;
  return `./auth.html?next=${encodeURIComponent(next)}`;
}

function buildAuthModeUrl(mode = "") {
  const base = new URL(buildAuthPageUrl(), location.href);
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "signin" || normalized === "signup") {
    base.searchParams.set("mode", normalized);
  }
  return base.toString();
}

function setGuestMode() {
  const loginUrl = buildAuthModeUrl("signin");
  const signupUrl = buildAuthModeUrl("signup");
  const infoForm = document.querySelector(".package-form.myinfo-form");
  const guestActions = $("#myInfoGuestActions");
  [
    "#myInfoLinePassword",
    "#myInfoLinePasswordConfirm",
    ".myinfo-actions",
    "#myInfoStatus",
    "#myInfoPackagesSection",
  ].forEach((selector) => {
    document.querySelector(selector)?.classList.add("hidden");
  });
  $("#myInfoPageTitle").textContent = "MY";
  $("#myInfoPackagesTitle").textContent = "나의 악보";
  document.title = "MY";
  setMyInfoAvatar("", "guest");
  setMyInfoSummary("-", "-");
  infoForm?.classList.add("hidden");
  guestActions?.classList.remove("hidden");

  $("#btnMyInfoGuestLogin")?.addEventListener("click", () => {
    location.href = loginUrl;
  });
  $("#btnMyInfoGuestSignup")?.addEventListener("click", () => {
    location.href = signupUrl;
  });

  const searchInput = $("#myPackagesSearch");
  const clearBtn = $("#btnClearMyPackagesSearch");
  if (searchInput) {
    searchInput.value = "";
    searchInput.disabled = true;
    searchInput.placeholder = "로그인 후 검색할 수 있습니다.";
  }
  clearBtn?.classList.add("hidden");
  setMyInfoStatus("");
}

async function loadMySongs(userId = "") {
  const client = window.SB?.getClient?.();
  if (!client || !userId) return [];
  try {
    let data;
    let error;
    ({ data, error } = await client
      .from("songs")
      .select("id, title, artist, key, pdf_url, jpg_url, created_at, owner_id, uploader_nickname")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }));
    if (error) {
      ({ data, error } = await client
        .from("songs")
        .select("id, title, artist, key, pdf_url, jpg_url, created_at, owner_id")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }));
    }
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => ({
      id: row.id,
      title: row.title || "이름 없는 악보",
      artist: row.artist || "",
      key: row.key || "",
      pdfUrl: row.pdf_url || "",
      jpgUrl: row.jpg_url || "",
      createdAt: row.created_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.error("my songs 로드 오류:", err);
    return [];
  }
}

function getSongOpenUrl(item) {
  return String(item?.pdfUrl || item?.jpgUrl || "").trim();
}

async function renderSongs(userId, query = "") {
  const list = $("#myPackagesList");
  if (!list) return;
  const items = (await loadMySongs(userId)).filter((item) => matchesSongsQuery(item, query));

  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "vault-empty";
    empty.textContent = "업로드한 악보가 없습니다.";
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

    const songTitleEl = document.createElement("span");
    songTitleEl.className = "vault-package-name";
    songTitleEl.textContent = item.title;

    const artistEl = document.createElement("span");
    artistEl.className = "vault-item-nickname vault-label-all";
    const artistText = item.artist || "-";
    const keyText = item.key ? `${item.key}키` : "-";
    artistEl.textContent = `${artistText}ㆍ${keyText}`;

    name.append(songTitleEl, artistEl);

    const date = document.createElement("div");
    date.className = "vault-item-date";
    date.textContent = formatDate(item.createdAt);
    meta.append(name, date);

    const actions = document.createElement("div");
    actions.className = "vault-item-actions";

    const openUrl = getSongOpenUrl(item);
    const openBtn = document.createElement("button");
    openBtn.className = "btn vault-btn-open";
    openBtn.textContent = "열기";
    openBtn.disabled = !openUrl;
    openBtn.addEventListener("click", () => {
      if (!openUrl) return;
      window.open(openUrl, "_blank");
    });

    actions.append(openBtn);
    row.append(meta, actions);
    list.appendChild(row);
  });
}

async function saveProfileImage(client, userId, file) {
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filePath = `${userId}/profile-${Date.now()}.${extension}`;
  const { error: uploadError } = await client.storage
    .from("score-files")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
  if (uploadError) throw uploadError;

  const { data } = client.storage.from("score-files").getPublicUrl(filePath);
  const imageUrl = String(data?.publicUrl || "").trim();
  if (!imageUrl) throw new Error("프로필 이미지 URL을 만들지 못했습니다.");

  const { error: profileError } = await client
    .from("profiles")
    .update({ avatar_image_url: imageUrl })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { error: feedError } = await client
    .from("feed_posts")
    .update({ author_avatar_image_url: imageUrl })
    .eq("owner_id", userId);
  if (feedError) throw feedError;

  return imageUrl;
}

function bindMyInfoAvatarCropper(onSave) {
  const stage = $("#myInfoAvatarCropStage");
  const saveBtn = $("#myInfoAvatarCropSave");

  document.querySelectorAll("[data-avatar-crop-close]").forEach((node) => {
    node.addEventListener("click", () => {
      closeMyInfoAvatarCropModal();
      cleanupMyInfoAvatarCropState();
    });
  });

  stage?.addEventListener("pointerdown", (event) => {
    if (!myInfoAvatarCropState.image) return;
    myInfoAvatarCropState.dragging = true;
    myInfoAvatarCropState.pointerId = event.pointerId;
    myInfoAvatarCropState.dragStartX = event.clientX;
    myInfoAvatarCropState.dragStartY = event.clientY;
    myInfoAvatarCropState.dragOriginX = myInfoAvatarCropState.offsetX;
    myInfoAvatarCropState.dragOriginY = myInfoAvatarCropState.offsetY;
    stage.setPointerCapture(event.pointerId);
  });

  stage?.addEventListener("pointermove", (event) => {
    if (!myInfoAvatarCropState.dragging || myInfoAvatarCropState.pointerId !== event.pointerId) return;
    myInfoAvatarCropState.offsetX = myInfoAvatarCropState.dragOriginX + (event.clientX - myInfoAvatarCropState.dragStartX);
    myInfoAvatarCropState.offsetY = myInfoAvatarCropState.dragOriginY + (event.clientY - myInfoAvatarCropState.dragStartY);
    syncMyInfoAvatarCropPreview();
  });

  const stopDrag = (event) => {
    if (myInfoAvatarCropState.pointerId !== event.pointerId) return;
    myInfoAvatarCropState.dragging = false;
    myInfoAvatarCropState.pointerId = null;
    if (stage.hasPointerCapture?.(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  };

  stage?.addEventListener("pointerup", stopDrag);
  stage?.addEventListener("pointercancel", stopDrag);

  saveBtn?.addEventListener("click", async () => {
    if (myInfoAvatarUploading || !myInfoAvatarCropState.file) return;
    await onSave();
  });
}

async function init() {
  applyUiTheme(getStoredTheme());
  $("#btnThemeToggle")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.uiTheme === "dark" ? "light" : "dark";
    applyUiTheme(nextTheme);
    saveUiTheme(nextTheme);
  });

  if (!window.SB?.isConfigured()) {
    setGuestMode();
    return;
  }
  const client = window.SB.getClient();
  if (!client) {
    setGuestMode();
    return;
  }

  const { data } = await client.auth.getSession();
  const session = data?.session || null;
  if (!session) {
    setGuestMode();
    return;
  }

  const nickname = String(
    session.user?.user_metadata?.nickname ||
    session.user?.email?.split("@")[0] ||
    "-"
  );
  const email = String(session.user?.email || "-");
  const userId = String(session.user?.id || "");
  let avatarImageUrl = "";
  const pageTitle = nickname && nickname !== "-" ? `${nickname}님의 정보` : "나의 정보";
  const packagesTitle = nickname && nickname !== "-" ? `${nickname}님의 악보` : "나의 악보";

  $("#myInfoPageTitle").textContent = pageTitle;
  $("#myInfoPackagesTitle").textContent = packagesTitle;
  document.title = pageTitle;
  setMyInfoSummary(nickname, email);

  try {
    const { data: profile } = await client
      .from("profiles")
      .select("avatar_image_url")
      .eq("id", session.user.id)
      .maybeSingle();
    avatarImageUrl = String(profile?.avatar_image_url || "").trim();
  } catch {}

  const getAvatarSeed = () => userId || nickname || email;
  setMyInfoAvatar(avatarImageUrl, getAvatarSeed());

  bindMyInfoAvatarCropper(async () => {
    myInfoAvatarUploading = true;
    setMyInfoStatus("프로필 사진 업로드 중...");
    try {
      const blob = await createMyInfoAvatarCroppedBlob();
      const uploadFile = new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" });
      avatarImageUrl = await saveProfileImage(client, userId, uploadFile);
      setMyInfoAvatar(avatarImageUrl, getAvatarSeed());
      setMyInfoStatus("프로필 사진이 저장되었습니다.");
      closeMyInfoAvatarCropModal();
      cleanupMyInfoAvatarCropState();
    } catch (error) {
      console.error(error);
      setMyInfoStatus("프로필 사진을 저장하지 못했습니다.", true);
    } finally {
      myInfoAvatarUploading = false;
    }
  });

  $("#myInfoAvatarButton")?.addEventListener("click", () => {
    $("#myInfoAvatarInput")?.click();
  });

  $("#myInfoAvatarInput")?.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file || myInfoAvatarUploading) return;
    try {
      await openMyInfoAvatarCropper(file);
      setMyInfoStatus("");
    } catch (error) {
      console.error(error);
      setMyInfoStatus("프로필 사진을 불러오지 못했습니다.", true);
    } finally {
      if (input) input.value = "";
    }
  });

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
    location.replace("./my-info.html");
  });

  const searchInput = $("#myPackagesSearch");
  const clearBtn = $("#btnClearMyPackagesSearch");
  const syncClear = () => {
    const has = (searchInput?.value || "").trim().length > 0;
    clearBtn?.classList.toggle("hidden", !has);
  };

  searchInput?.addEventListener("input", async () => {
    syncClear();
    await renderSongs(userId, searchInput.value || "");
  });
  clearBtn?.addEventListener("click", async () => {
    if (!searchInput) return;
    searchInput.value = "";
    syncClear();
    searchInput.focus();
    await renderSongs(userId, "");
  });

  syncClear();
  await renderSongs(userId, "");
}

init().catch((err) => {
  console.error("my info page 초기화 실패:", err);
  setMyInfoStatus("나의 정보를 불러오는 중 오류가 발생했습니다.", true);
});
