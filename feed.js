/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const FEED_TYPE_MAP = {
  notice: { label: "공지", badgeClass: "" },
  "new-song": { label: "새 악보", badgeClass: "feed-post-badge-soft" },
  "praise-recommend": { label: "찬양 추천", badgeClass: "feed-post-badge-warm" },
};
const ANIMAL_EMOJIS = ["🐶", "🐱", "🐰", "🦊", "🐻", "🐼", "🐯", "🦁", "🐨", "🐷", "🐹", "🐵"];

let feedWriteType = "";
let feedWriteIsAdmin = false;
let feedWriteImageDataUrl = "";
let feedWriteLinkUrl = "";
let feedWriteLinkThumbnailUrl = "";
let feedLinkPreviewToken = 0;
const FEED_DRAFT_STORAGE_KEY = "kkumakbo.feedDraft";

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getYoutubeThumbnailUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    let videoId = "";
    if (parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.replaceAll("/", "").trim();
    } else if (parsed.hostname.includes("youtube.com")) {
      videoId = parsed.searchParams.get("v") || "";
      if (!videoId && parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/")[2] || "";
      }
      if (!videoId && parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] || "";
      }
    }
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
  } catch {
    return "";
  }
}

function normalizeAvatarBgColor(value = "") {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#eef3ff";
}

function getClient() {
  return window.SB?.getClient?.() || null;
}

async function getSessionUser() {
  const client = getClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data?.session?.user || null;
  } catch {
    return null;
  }
}

function formatFeedTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 12) return `${Math.max(1, diffHour)}시간 전`;

  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();
  if (sameDay) return "오늘";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    yesterday.getFullYear() === date.getFullYear() &&
    yesterday.getMonth() === date.getMonth() &&
    yesterday.getDate() === date.getDate();
  if (diffHour < 24 && isYesterday) return "어제";

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

async function getProfile(userId) {
  const client = getClient();
  if (!client || !userId) return null;
  try {
    const { data, error } = await client
      .from("profiles")
      .select("nickname, role, avatar_emoji, avatar_bg_color")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function getFeedContext() {
  const user = await getSessionUser();
  if (!user) return { user: null, nickname: "", role: "" };
  const profile = await getProfile(user.id);
  return {
    user,
    nickname: profile?.nickname || user.user_metadata?.nickname || user.email?.split("@")[0] || "사용자",
    role: String(profile?.role || "").toLowerCase(),
    avatarEmoji: String(profile?.avatar_emoji || "").trim(),
    avatarBgColor: normalizeAvatarBgColor(profile?.avatar_bg_color || "#eef3ff"),
  };
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

function createFeedPostElement(post) {
  const article = document.createElement("article");
  article.className = "feed-post feed-post-user";
  article.dataset.feedPostId = post.id;
  const typeInfo = FEED_TYPE_MAP[post.type] || FEED_TYPE_MAP["new-song"];
  article.innerHTML = `
    <div class="feed-post-head">
      <div class="feed-avatar" aria-hidden="true" style="background:${escapeHtml(normalizeAvatarBgColor(post.authorAvatarBg || "#eef3ff"))}">${escapeHtml(String(post.authorAvatar || "").trim() || getStableAnimalEmoji(post.ownerId || post.author))}</div>
      <div class="feed-post-meta">
        <div class="feed-post-topline">
          <strong class="feed-post-author">${escapeHtml(post.author)}</strong>
          <span class="feed-post-badge ${escapeHtml(typeInfo.badgeClass)}">${escapeHtml(typeInfo.label)}</span>
          <span class="feed-post-sub">${escapeHtml(formatFeedTime(post.createdAt))}</span>
        </div>
      </div>
    </div>
    <h2 class="feed-post-title">${escapeHtml(post.title || "제목 없는 글")}</h2>
    <p class="feed-post-copy">${escapeHtml(post.content)}</p>
    ${post.imageUrl ? `<img class="feed-post-image" alt="" src="${escapeHtml(post.imageUrl)}" />` : ""}
    ${post.linkUrl ? `<a class="feed-post-link" href="${escapeHtml(post.linkUrl)}">${(post.linkThumbnailUrl || getYoutubeThumbnailUrl(post.linkUrl)) ? `<img class="feed-post-link-thumb" alt="" src="${escapeHtml(post.linkThumbnailUrl || getYoutubeThumbnailUrl(post.linkUrl))}" />` : ""}<span class="feed-post-link-url">${escapeHtml(post.linkUrl)}</span></a>` : ""}
  `;
  return article;
}

async function loadFeedPosts() {
  const client = getClient();
  if (!client) return [];
  const { data, error } = await client
    .from("feed_posts")
    .select("id, owner_id, author_nickname, author_avatar, author_avatar_bg, post_type, title, content, image_url, link_url, link_thumbnail_url, created_at")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id || "",
    author: row.author_nickname || "사용자",
    authorAvatar: row.author_avatar || "",
    authorAvatarBg: row.author_avatar_bg || "#eef3ff",
    type: row.post_type || "new-song",
    title: row.title || "",
    content: row.content || "",
    imageUrl: row.image_url || "",
    linkUrl: row.link_url || "",
    linkThumbnailUrl: row.link_thumbnail_url || "",
    createdAt: row.created_at || new Date().toISOString(),
  }));
}

async function renderFeedPosts() {
  const list = $("#feedList");
  if (!list) return;
  list.innerHTML = "";
  const items = await loadFeedPosts();
  items.forEach((item) => list.appendChild(createFeedPostElement(item)));
}

function syncFeedTypeUi() {
  const label = $("#feedWriteDestinationLabel");
  const trigger = $("#feedWriteDestinationTrigger");
  const selected = FEED_TYPE_MAP[feedWriteType];
  document.querySelectorAll(".feed-write-destination-option").forEach((button) => {
    const isNotice = button.dataset.feedType === "notice";
    button.classList.toggle("hidden", isNotice && !feedWriteIsAdmin);
  });
  if (label) label.textContent = selected ? selected.label : "어디에 글을 남길까요?";
  if (trigger) trigger.classList.toggle("is-placeholder", !selected);
}

function setFeedTypeMenu(open) {
  const menu = $("#feedWriteDestinationMenu");
  const trigger = $("#feedWriteDestinationTrigger");
  if (!menu || !trigger) return;
  menu.classList.toggle("hidden", !open);
  trigger.setAttribute("aria-expanded", String(open));
}

function setFeedWriteStatus(message = "", isError = false) {
  const status = $("#feedWriteStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", !!isError);
}

function setFeedLinkStatus(message = "", isError = false) {
  const status = $("#feedLinkStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", !!isError);
}

function renderFeedImagePreview() {
  const preview = $("#feedImagePreview");
  if (!preview) return;
  if (!feedWriteImageDataUrl) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }
  preview.classList.remove("hidden");
  preview.innerHTML = `<img src="${escapeHtml(feedWriteImageDataUrl)}" alt="선택한 이미지 미리보기" />`;
}

function renderFeedLinkAttached() {
  const box = $("#feedLinkAttached");
  if (!box) return;
  if (!feedWriteLinkUrl) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `<span>${escapeHtml(feedWriteLinkUrl)}</span>`;
}

function renderFeedLinkPreview(url = "") {
  const preview = $("#feedLinkPreview");
  if (!preview) return;
  if (!url) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }
  preview.classList.remove("hidden");
  preview.innerHTML = `<img src="${escapeHtml(url)}" alt="링크 썸네일 미리보기" />`;
}

function getFeedDraftPayload() {
  return {
    type: feedWriteType,
    title: String($("#feedWriteSubject")?.value || "").trim(),
    content: String($("#feedWriteText")?.value || "").trim(),
    imageUrl: feedWriteImageDataUrl,
    linkUrl: feedWriteLinkUrl,
    linkThumbnailUrl: feedWriteLinkThumbnailUrl,
  };
}

function hasFeedDraftChanges() {
  const draft = getFeedDraftPayload();
  return Boolean(
    draft.type ||
      draft.title ||
      draft.content ||
      draft.imageUrl ||
      draft.linkUrl ||
      draft.linkThumbnailUrl,
  );
}

function saveFeedDraft() {
  try {
    localStorage.setItem(FEED_DRAFT_STORAGE_KEY, JSON.stringify(getFeedDraftPayload()));
  } catch {}
}

function loadFeedDraft() {
  try {
    const raw = localStorage.getItem(FEED_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearFeedDraft() {
  try {
    localStorage.removeItem(FEED_DRAFT_STORAGE_KEY);
  } catch {}
}

function resetFeedComposeState() {
  feedWriteType = "";
  feedWriteImageDataUrl = "";
  feedWriteLinkUrl = "";
  feedWriteLinkThumbnailUrl = "";
  const subjectInput = $("#feedWriteSubject");
  const textarea = $("#feedWriteText");
  const imageInput = $("#feedImageInput");
  const linkInput = $("#feedLinkInput");
  if (subjectInput) subjectInput.value = "";
  if (textarea) textarea.value = "";
  if (imageInput) imageInput.value = "";
  if (linkInput) linkInput.value = "";
  renderFeedImagePreview();
  renderFeedLinkAttached();
  renderFeedLinkPreview("");
  setFeedLinkEditor(false);
  syncFeedTypeUi();
  syncFeedWriteSubmitState();
  setFeedWriteStatus("");
  setFeedLinkStatus("");
}

function applyFeedDraft(draft) {
  if (!draft) return;
  feedWriteType = String(draft.type || "");
  feedWriteImageDataUrl = String(draft.imageUrl || "");
  feedWriteLinkUrl = String(draft.linkUrl || "");
  feedWriteLinkThumbnailUrl = String(draft.linkThumbnailUrl || "");
  const subjectInput = $("#feedWriteSubject");
  const textarea = $("#feedWriteText");
  const linkInput = $("#feedLinkInput");
  if (subjectInput) subjectInput.value = String(draft.title || "");
  if (textarea) textarea.value = String(draft.content || "");
  if (linkInput) linkInput.value = feedWriteLinkUrl;
  renderFeedImagePreview();
  renderFeedLinkAttached();
  renderFeedLinkPreview(feedWriteLinkThumbnailUrl);
  syncFeedTypeUi();
  syncFeedWriteSubmitState();
}

function closeFeedCompose(discardDraft = false) {
  if (discardDraft) clearFeedDraft();
  resetFeedComposeState();
  setFeedWriteModal(false);
}

function requestFeedComposeClose() {
  if (!hasFeedDraftChanges()) {
    closeFeedCompose(false);
    return;
  }
  const shouldSaveDraft = window.confirm("임시글로 저장하시겠습니까?");
  if (shouldSaveDraft) {
    saveFeedDraft();
    closeFeedCompose(false);
    return;
  }
  closeFeedCompose(true);
}

function setFeedLinkEditor(open) {
  const editor = $("#feedLinkEditor");
  if (!editor) return;
  editor.classList.toggle("hidden", !open);
  if (open) {
    requestAnimationFrame(() => $("#feedLinkInput")?.focus());
  } else {
    setFeedLinkStatus("");
  }
}

function syncFeedWriteSubmitState() {
  const subjectInput = $("#feedWriteSubject");
  const textarea = $("#feedWriteText");
  const submitBtn = $("#feedWriteSubmit");
  if (!subjectInput || !textarea || !submitBtn) return;
  submitBtn.disabled = !Boolean(feedWriteType && String(subjectInput.value || "").trim() && String(textarea.value || "").trim());
}

function setFeedWriteModal(open) {
  const modal = $("#feedWriteModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !open);
  if (open) {
    syncFeedTypeUi();
    applyFeedDraft(loadFeedDraft());
    setFeedTypeMenu(false);
    syncFeedWriteSubmitState();
    renderFeedImagePreview();
    renderFeedLinkAttached();
    setFeedLinkEditor(false);
    requestAnimationFrame(() => $("#feedWriteSubject")?.focus());
  } else {
    setFeedTypeMenu(false);
    setFeedWriteStatus("");
  }
}

function normalizeLinkUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

async function fetchLinkPreview(url = "") {
  const client = getClient();
  if (!client) throw new Error("Supabase client not ready");
  const { data, error } = await client.functions.invoke("link-preview", {
    body: { url },
  });
  if (error) throw error;
  return data || {};
}

async function tryRenderFeedLinkPreview(value = "") {
  const url = normalizeLinkUrl(value);
  const token = ++feedLinkPreviewToken;
  if (!url) {
    feedWriteLinkThumbnailUrl = "";
    renderFeedLinkPreview("");
    return;
  }
  const youtubeThumbnail = getYoutubeThumbnailUrl(url);
  if (youtubeThumbnail) {
    feedWriteLinkThumbnailUrl = youtubeThumbnail;
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl);
    setFeedLinkStatus("");
    return;
  }
  try {
    const preview = await fetchLinkPreview(url);
    if (token !== feedLinkPreviewToken) return;
    feedWriteLinkThumbnailUrl = String(preview?.image || "").trim();
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl);
    setFeedLinkStatus("");
  } catch {
    if (token !== feedLinkPreviewToken) return;
    feedWriteLinkThumbnailUrl = "";
    renderFeedLinkPreview("");
  }
}

async function submitFeedPost() {
  const subjectInput = $("#feedWriteSubject");
  const textarea = $("#feedWriteText");
  const submitBtn = $("#feedWriteSubmit");
  if (!subjectInput || !textarea || !submitBtn) return;

  const title = String(subjectInput.value || "").trim();
  const content = String(textarea.value || "").trim();
  if (!feedWriteType) {
    setFeedWriteStatus("분류를 선택해 주세요.", true);
    return;
  }
  if (!title) {
    setFeedWriteStatus("제목을 입력해 주세요.", true);
    subjectInput.focus();
    return;
  }
  if (!content) {
    setFeedWriteStatus("내용을 입력해 주세요.", true);
    textarea.focus();
    return;
  }

  submitBtn.disabled = true;
  setFeedWriteStatus("");

  const { user, nickname, role, avatarEmoji, avatarBgColor } = await getFeedContext();
  if (!user) {
    setFeedWriteStatus("로그인 후 글을 작성할 수 있습니다.", true);
    submitBtn.disabled = false;
    return;
  }
  if (feedWriteType === "notice" && role !== "admin") {
    setFeedWriteStatus("공지는 관리자만 작성할 수 있습니다.", true);
    submitBtn.disabled = false;
    return;
  }

  const client = getClient();
  if (!client) {
    setFeedWriteStatus("Supabase 연결을 확인해 주세요.", true);
    submitBtn.disabled = false;
    return;
  }

  const { data, error } = await client
    .from("feed_posts")
    .insert({
      owner_id: user.id,
      author_nickname: nickname,
      author_avatar: avatarEmoji,
      author_avatar_bg: avatarBgColor,
      post_type: feedWriteType,
      title,
      content,
      image_url: feedWriteImageDataUrl,
      link_url: feedWriteLinkUrl,
      link_thumbnail_url: feedWriteLinkThumbnailUrl,
    })
    .select("id, owner_id, author_nickname, author_avatar, author_avatar_bg, post_type, title, content, image_url, link_url, link_thumbnail_url, created_at")
    .single();

  if (error || !data) {
    setFeedWriteStatus("글을 저장하지 못했습니다.", true);
    submitBtn.disabled = false;
    return;
  }

  const list = $("#feedList");
  list?.prepend(
    createFeedPostElement({
      id: data.id,
      ownerId: data.owner_id || user.id,
      author: data.author_nickname || nickname,
      authorAvatar: data.author_avatar || avatarEmoji,
      authorAvatarBg: data.author_avatar_bg || avatarBgColor,
      type: data.post_type,
      title: data.title,
      content: data.content,
      imageUrl: data.image_url || "",
      linkUrl: data.link_url || "",
      linkThumbnailUrl: data.link_thumbnail_url || "",
      createdAt: data.created_at,
    }),
  );

  clearFeedDraft();
  resetFeedComposeState();
  setFeedWriteModal(false);
  submitBtn.disabled = false;
}

function bindFeedCompose() {
  $("#feedComposeBtn")?.addEventListener("click", async () => {
    const context = await getFeedContext();
    if (!context.user) return;
    feedWriteIsAdmin = context.role === "admin";
    setFeedWriteModal(true);
  });

  document.querySelectorAll("[data-feed-close]").forEach((node) => {
    node.addEventListener("click", requestFeedComposeClose);
  });

  $("#feedImagePickerBtn")?.addEventListener("click", () => $("#feedImageInput")?.click());

  $("#feedImageInput")?.addEventListener("change", (event) => {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      feedWriteImageDataUrl = typeof reader.result === "string" ? reader.result : "";
      renderFeedImagePreview();
    };
    reader.readAsDataURL(file);
  });

  $("#feedLinkPickerBtn")?.addEventListener("click", () => {
    const input = $("#feedLinkInput");
    if (input) input.value = feedWriteLinkUrl;
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl);
    setFeedLinkStatus("");
    setFeedLinkEditor(true);
  });

  $("#feedLinkInput")?.addEventListener("input", (event) => {
    const value = event.currentTarget?.value || "";
    setFeedLinkStatus("");
    tryRenderFeedLinkPreview(value).catch(() => {});
  });

  $("#feedLinkConfirmBtn")?.addEventListener("click", () => {
    (async () => {
      const input = $("#feedLinkInput");
      const url = normalizeLinkUrl(input?.value || "");
      if (!url) {
        setFeedLinkStatus("링크를 입력해 주세요.", true);
        return;
      }

      if (!feedWriteLinkThumbnailUrl) {
        const youtubeThumbnail = getYoutubeThumbnailUrl(url);
        if (youtubeThumbnail) {
          feedWriteLinkThumbnailUrl = youtubeThumbnail;
          renderFeedLinkPreview(feedWriteLinkThumbnailUrl);
        } else {
        try {
          const preview = await fetchLinkPreview(url);
          feedWriteLinkThumbnailUrl = String(preview?.image || "").trim();
          renderFeedLinkPreview(feedWriteLinkThumbnailUrl);
        } catch {}
        }
      }

      feedWriteLinkUrl = url;
      renderFeedLinkAttached();
      setFeedLinkEditor(false);
    })().catch(() => {
      setFeedLinkStatus("링크를 처리하지 못했습니다.", true);
    });
  });

  $("#feedLinkCancelBtn")?.addEventListener("click", () => setFeedLinkEditor(false));

  $("#feedWriteSubmit")?.addEventListener("click", () => {
    submitFeedPost().catch(() => {
      setFeedWriteStatus("글을 저장하지 못했습니다.", true);
      const submitBtn = $("#feedWriteSubmit");
      if (submitBtn) submitBtn.disabled = false;
    });
  });

  ["#feedWriteSubject", "#feedWriteText"].forEach((selector) => {
    $(selector)?.addEventListener("input", () => {
      setFeedWriteStatus("");
      syncFeedWriteSubmitState();
    });
  });

  $("#feedWriteDestinationTrigger")?.addEventListener("click", () => {
    const menu = $("#feedWriteDestinationMenu");
    if (!menu) return;
    setFeedTypeMenu(menu.classList.contains("hidden"));
  });

  document.querySelectorAll(".feed-write-destination-option").forEach((button) => {
    button.addEventListener("click", () => {
      feedWriteType = button.dataset.feedType || "";
      syncFeedTypeUi();
      syncFeedWriteSubmitState();
      setFeedTypeMenu(false);
      setFeedWriteStatus("");
    });
  });

  document.addEventListener("click", (event) => {
    const menu = $("#feedWriteDestinationMenu");
    const trigger = $("#feedWriteDestinationTrigger");
    if (!menu || !trigger) return;
    if (menu.classList.contains("hidden")) return;
    if (menu.contains(event.target) || trigger.contains(event.target)) return;
    setFeedTypeMenu(false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderFeedPosts().catch(() => {});
  bindFeedCompose();
  syncFeedWriteSubmitState();
});
