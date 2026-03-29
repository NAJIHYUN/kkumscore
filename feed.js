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
const KOR_INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

let feedWriteType = "";
let feedWriteIsAdmin = false;
let feedWriteImageDataUrl = "";
let feedWriteLinkUrl = "";
let feedWriteLinkTitle = "";
let feedWriteLinkThumbnailUrl = "";
let feedLinkPreviewToken = 0;
let feedScoreLibrary = [];
let feedScoreLibraryLoaded = false;
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

function getChosung(str = "") {
  const text = String(str).normalize("NFC");
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += KOR_INITIALS[Math.floor((code - 0xac00) / (21 * 28))] || "";
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}

function normalizeSearchText(value = "") {
  return String(value || "").normalize("NFC").trim().toLowerCase();
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

function getLinkDisplayHost(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
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
    let data;
    let error;
    ({ data, error } = await client
      .from("profiles")
      .select("nickname, role, avatar_image_url, avatar_emoji, avatar_bg_color")
      .eq("id", userId)
      .maybeSingle());
    if (error) {
      ({ data, error } = await client
        .from("profiles")
        .select("nickname, role, avatar_emoji, avatar_bg_color")
        .eq("id", userId)
        .maybeSingle());
    }
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
    avatarImageUrl: String(profile?.avatar_image_url || "").trim(),
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

function getFeedAvatarMarkup(post) {
  const imageUrl = String(post.authorAvatarImageUrl || "").trim();
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="" />`;
  }
  return escapeHtml(String(post.authorAvatar || "").trim() || getStableAnimalEmoji(post.ownerId || post.author));
}

function buildFeedInlineMarkup(text = "") {
  const urlRegex = /(https?:\/\/[^\s<]+)/gi;
  let lastIndex = 0;
  let markup = "";
  for (const match of text.matchAll(urlRegex)) {
    const url = match[0];
    const index = match.index || 0;
    markup += escapeHtml(text.slice(lastIndex, index));
    markup += `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;
    lastIndex = index + url.length;
  }
  markup += escapeHtml(text.slice(lastIndex));
  return markup;
}

function parseFeedScoreLine(line = "") {
  const text = String(line || "").trim();
  if (!text.startsWith("[악보]")) return null;
  const raw = text.slice(4).trim();
  if (!raw) return null;
  const parts = raw.split(" / ").map((value) => value.trim());
  return {
    title: parts[0] || "",
    artist: parts[1] || "",
  };
}

function renderFeedContentMarkup(content = "") {
  const lines = String(content || "").split("\n");
  const blocks = [];
  let paragraphLines = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(`<p class="feed-post-copy">${paragraphLines.map((line) => buildFeedInlineMarkup(line)).join("<br />")}</p>`);
    paragraphLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const score = parseFeedScoreLine(line);
    const nextLine = String(lines[i + 1] || "").trim();
    if (score && /^https?:\/\//i.test(nextLine)) {
      flushParagraph();
      blocks.push(`
        <a class="feed-post-score" href="${escapeHtml(nextLine)}" target="_blank" rel="noreferrer">
          <span class="feed-post-score-label">악보</span>
          <span class="feed-post-score-meta">
            <strong class="feed-post-score-title">${escapeHtml(score.title || "이름 없는 악보")}</strong>
            ${score.artist ? `<span class="feed-post-score-artist">${escapeHtml(score.artist)}</span>` : ""}
          </span>
        </a>
      `);
      i += 1;
      continue;
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks.join("");
}

function createFeedPostElement(post) {
  const article = document.createElement("article");
  article.className = "feed-post feed-post-user";
  article.dataset.feedPostId = post.id;
  const typeInfo = FEED_TYPE_MAP[post.type] || FEED_TYPE_MAP["new-song"];
  article.innerHTML = `
    <div class="feed-post-head">
      <div class="feed-avatar" aria-hidden="true" style="background:${escapeHtml(normalizeAvatarBgColor(post.authorAvatarBg || "#eef3ff"))}">${getFeedAvatarMarkup(post)}</div>
      <div class="feed-post-meta">
        <div class="feed-post-topline">
          <strong class="feed-post-author">${escapeHtml(post.author)}</strong>
          <span class="feed-post-badge ${escapeHtml(typeInfo.badgeClass)}">${escapeHtml(typeInfo.label)}</span>
          <span class="feed-post-sub">${escapeHtml(formatFeedTime(post.createdAt))}</span>
        </div>
      </div>
    </div>
    <h2 class="feed-post-title">${escapeHtml(post.title || "제목 없는 글")}</h2>
    <p class="feed-post-copy">${renderFeedContentMarkup(post.content)}</p>
    ${post.imageUrl ? `<img class="feed-post-image" alt="" src="${escapeHtml(post.imageUrl)}" />` : ""}
    ${post.linkUrl ? `<a class="feed-post-link" href="${escapeHtml(post.linkUrl)}">${(post.linkThumbnailUrl || getYoutubeThumbnailUrl(post.linkUrl)) ? `<img class="feed-post-link-thumb" alt="" src="${escapeHtml(post.linkThumbnailUrl || getYoutubeThumbnailUrl(post.linkUrl))}" />` : ""}<span class="feed-post-link-url">${escapeHtml(post.linkUrl)}</span></a>` : ""}
  `;
  return article;
}

async function hydrateFeedLinkCard(post, article) {
  if (!post?.linkUrl || post?.linkTitle) return;
  try {
    const preview = await fetchLinkPreview(post.linkUrl);
    const nextThumb = String(preview?.image || "").trim();
    const thumbEl = article.querySelector(".feed-post-link-thumb");
    if (!thumbEl && nextThumb) {
      const linkEl = article.querySelector(".feed-post-link");
      if (linkEl) {
        const img = document.createElement("img");
        img.className = "feed-post-link-thumb";
        img.alt = "";
        img.src = nextThumb;
        linkEl.prepend(img);
      }
    }
  } catch {}
}

async function loadFeedPosts() {
  const client = getClient();
  if (!client) return [];
  let data;
  let error;
  ({ data, error } = await client
    .from("feed_posts")
    .select("id, owner_id, author_nickname, author_avatar_image_url, author_avatar, author_avatar_bg, post_type, title, content, image_url, link_url, link_title, link_thumbnail_url, created_at")
    .order("created_at", { ascending: false }));
  if (error) {
    ({ data, error } = await client
      .from("feed_posts")
      .select("id, owner_id, author_nickname, author_avatar, author_avatar_bg, post_type, title, content, image_url, link_url, link_thumbnail_url, created_at")
      .order("created_at", { ascending: false }));
  }
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id || "",
    author: row.author_nickname || "사용자",
    authorAvatarImageUrl: row.author_avatar_image_url || "",
    authorAvatar: row.author_avatar || "",
    authorAvatarBg: row.author_avatar_bg || "#eef3ff",
    type: row.post_type || "new-song",
    title: row.title || "",
    content: row.content || "",
    imageUrl: row.image_url || "",
    linkUrl: row.link_url || "",
    linkTitle: row.link_title || "",
    linkThumbnailUrl: row.link_thumbnail_url || "",
    createdAt: row.created_at || new Date().toISOString(),
  }));
}

async function renderFeedPosts() {
  const list = $("#feedList");
  if (!list) return;
  list.innerHTML = "";
  const items = await loadFeedPosts();
  items.forEach((item) => {
    const article = createFeedPostElement(item);
    list.appendChild(article);
    hydrateFeedLinkCard(item, article).catch(() => {});
  });
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

function renderFeedLinkPreview(url = "", title = "", linkUrl = "") {
  const preview = $("#feedLinkPreview");
  if (!preview) return;
  if (!url && !title && !linkUrl) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }
  preview.classList.remove("hidden");
  const displayTitle = String(title || "").trim() || getLinkDisplayHost(linkUrl);
  preview.innerHTML = `
    ${url ? `<img src="${escapeHtml(url)}" alt="링크 썸네일 미리보기" />` : ""}
    ${displayTitle ? `<strong class="feed-link-preview-title">${escapeHtml(displayTitle)}</strong>` : ""}
    ${linkUrl ? `<span class="feed-link-preview-url">${escapeHtml(linkUrl)}</span>` : ""}
  `;
}

function setFeedScoreStatus(message = "", isError = false) {
  const status = $("#feedScoreStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", !!isError);
}

function setFeedScoreEditor(open) {
  const editor = $("#feedScoreEditor");
  if (!editor) return;
  editor.classList.toggle("hidden", !open);
  if (open) {
    requestAnimationFrame(() => $("#feedScoreInput")?.focus());
  } else {
    const input = $("#feedScoreInput");
    if (input) input.value = "";
    renderFeedScoreSuggestions([]);
    setFeedScoreStatus("");
  }
}

function renderFeedScoreSuggestions(items = []) {
  const panel = $("#feedScoreSuggest");
  if (!panel) return;
  if (!items.length) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    return;
  }
  panel.innerHTML = "";
  items.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feed-score-suggest-item";
    button.setAttribute("role", "option");
    const meta = [song.artist, song.key].filter(Boolean).join(" · ");
    button.innerHTML = `
      <strong>${escapeHtml(song.title || "이름 없는 악보")}</strong>
      <span>${escapeHtml(meta || "업로드한 악보")}</span>
    `;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      insertSelectedScoreLink(song);
    });
    panel.appendChild(button);
  });
  panel.classList.remove("hidden");
}

async function loadFeedScoreLibrary() {
  if (feedScoreLibraryLoaded) return feedScoreLibrary;
  const client = getClient();
  let songs = [];
  if (client) {
    try {
      const { data, error } = await client
        .from("songs")
        .select("id, title, artist, key, pdf_url, jpg_url, created_at")
        .order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        songs = data.map((row) => ({
          id: String(row.id || ""),
          title: String(row.title || "").trim(),
          artist: String(row.artist || "").trim(),
          key: String(row.key || "").trim(),
          fileUrl: String(row.pdf_url || row.jpg_url || "").trim(),
          createdAt: row.created_at || "",
        }));
      }
    } catch {}
  }
  if (!songs.length) {
    try {
      const response = await fetch("./songs.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          songs = data.map((row, index) => ({
            id: String(row.id || `song-${index + 1}`),
            title: String(row.title || "").trim(),
            artist: String(row.artist || "").trim(),
            key: String(row.key || "").trim(),
            fileUrl: String(row.pdfUrl || row.file || row.jpgUrl || "").trim(),
            createdAt: row.createdAt || "",
          }));
        }
      }
    } catch {}
  }
  feedScoreLibrary = songs.filter((song) => song.id && song.title && song.fileUrl);
  feedScoreLibraryLoaded = true;
  return feedScoreLibrary;
}

function searchFeedScores(keyword = "") {
  const normalizedKeyword = normalizeSearchText(keyword);
  const chosungKeyword = normalizedKeyword.replace(/\s+/g, "");
  const hasChosung = /[ㄱ-ㅎ]/.test(chosungKeyword);
  const source = feedScoreLibrary;
  if (!normalizedKeyword) return source.slice(0, 8);
  return source.filter((song) => {
    const title = normalizeSearchText(song.title);
    const artist = normalizeSearchText(song.artist);
    const key = normalizeSearchText(song.key);
    if (title.includes(normalizedKeyword) || artist.includes(normalizedKeyword) || key.includes(normalizedKeyword)) {
      return true;
    }
    if (!hasChosung) return false;
    const chosung = `${getChosung(song.title)} ${getChosung(song.artist)}`.replace(/\s+/g, "");
    return chosung.includes(chosungKeyword);
  }).slice(0, 8);
}

function insertTextAtCursor(input, text) {
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = `${before}${text}${after}`;
  const nextCursor = start + text.length;
  input.setSelectionRange(nextCursor, nextCursor);
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertSelectedScoreLink(song) {
  const textarea = $("#feedWriteText");
  if (!textarea || !song?.fileUrl) return;
  const meta = [song.title, song.artist].filter(Boolean).join(" / ");
  const prefix = textarea.value && !textarea.value.endsWith("\n") ? "\n\n" : "";
  insertTextAtCursor(textarea, `${prefix}[악보] ${meta}\n${song.fileUrl}`);
  setFeedScoreEditor(false);
  setFeedWriteStatus("악보 링크를 본문에 넣었어요.");
}

function getFeedDraftPayload() {
  return {
    type: feedWriteType,
    title: String($("#feedWriteSubject")?.value || "").trim(),
    content: String($("#feedWriteText")?.value || "").trim(),
    imageUrl: feedWriteImageDataUrl,
    linkUrl: feedWriteLinkUrl,
    linkTitle: feedWriteLinkTitle,
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
      draft.linkTitle ||
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
  feedWriteLinkTitle = "";
  feedWriteLinkThumbnailUrl = "";
  const subjectInput = $("#feedWriteSubject");
  const textarea = $("#feedWriteText");
  const imageInput = $("#feedImageInput");
  const linkInput = $("#feedLinkInput");
  const scoreInput = $("#feedScoreInput");
  if (subjectInput) subjectInput.value = "";
  if (textarea) textarea.value = "";
  if (imageInput) imageInput.value = "";
  if (linkInput) linkInput.value = "";
  if (scoreInput) scoreInput.value = "";
  renderFeedImagePreview();
  renderFeedLinkPreview("", "", "");
  setFeedLinkEditor(false);
  setFeedScoreEditor(false);
  syncFeedTypeUi();
  syncFeedWriteSubmitState();
  setFeedWriteStatus("");
  setFeedLinkStatus("");
  setFeedScoreStatus("");
}

function applyFeedDraft(draft) {
  if (!draft) return;
  feedWriteType = String(draft.type || "");
  feedWriteImageDataUrl = String(draft.imageUrl || "");
  feedWriteLinkUrl = String(draft.linkUrl || "");
  feedWriteLinkTitle = String(draft.linkTitle || "");
  feedWriteLinkThumbnailUrl = String(draft.linkThumbnailUrl || "");
  const subjectInput = $("#feedWriteSubject");
  const textarea = $("#feedWriteText");
  const linkInput = $("#feedLinkInput");
  if (subjectInput) subjectInput.value = String(draft.title || "");
  if (textarea) textarea.value = String(draft.content || "");
  if (linkInput) linkInput.value = feedWriteLinkUrl;
  renderFeedImagePreview();
  renderFeedLinkPreview(feedWriteLinkThumbnailUrl, feedWriteLinkTitle, feedWriteLinkUrl);
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
    setFeedLinkEditor(false);
    setFeedScoreEditor(false);
    requestAnimationFrame(() => $("#feedWriteSubject")?.focus());
  } else {
    setFeedTypeMenu(false);
    setFeedLinkEditor(false);
    setFeedScoreEditor(false);
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
    renderFeedLinkPreview("", "", "");
    return;
  }
  const youtubeThumbnail = getYoutubeThumbnailUrl(url);
  if (youtubeThumbnail) {
    feedWriteLinkTitle = "";
    feedWriteLinkThumbnailUrl = youtubeThumbnail;
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl, feedWriteLinkTitle, url);
    setFeedLinkStatus("");
  }
  try {
    const preview = await fetchLinkPreview(url);
    if (token !== feedLinkPreviewToken) return;
    feedWriteLinkTitle = String(preview?.title || "").trim();
    feedWriteLinkThumbnailUrl = String(preview?.image || "").trim() || youtubeThumbnail;
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl, feedWriteLinkTitle, url);
    setFeedLinkStatus("");
  } catch {
    if (token !== feedLinkPreviewToken) return;
    feedWriteLinkThumbnailUrl = youtubeThumbnail || "";
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl, feedWriteLinkTitle, url);
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

  const { user, nickname, role, avatarImageUrl, avatarEmoji, avatarBgColor } = await getFeedContext();
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

  let data;
  let error;
  ({ data, error } = await client
    .from("feed_posts")
    .insert({
      owner_id: user.id,
      author_nickname: nickname,
      author_avatar_image_url: avatarImageUrl,
      author_avatar: avatarEmoji,
      author_avatar_bg: avatarBgColor,
      post_type: feedWriteType,
      title,
      content,
      image_url: feedWriteImageDataUrl,
      link_url: feedWriteLinkUrl,
      link_title: feedWriteLinkTitle,
      link_thumbnail_url: feedWriteLinkThumbnailUrl,
    })
    .select("id, owner_id, author_nickname, author_avatar_image_url, author_avatar, author_avatar_bg, post_type, title, content, image_url, link_url, link_title, link_thumbnail_url, created_at")
    .single());
  if (error) {
    ({ data, error } = await client
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
      .single());
  }
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
      authorAvatarImageUrl: data.author_avatar_image_url || avatarImageUrl,
      authorAvatar: data.author_avatar || avatarEmoji,
      authorAvatarBg: data.author_avatar_bg || avatarBgColor,
      type: data.post_type,
      title: data.title,
      content: data.content,
      imageUrl: data.image_url || "",
      linkUrl: data.link_url || "",
      linkTitle: data.link_title || feedWriteLinkTitle,
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
    renderFeedLinkPreview(feedWriteLinkThumbnailUrl, feedWriteLinkTitle, feedWriteLinkUrl);
    setFeedLinkStatus("");
    setFeedScoreEditor(false);
    setFeedLinkEditor(true);
  });

  $("#feedScorePickerBtn")?.addEventListener("click", async () => {
    setFeedLinkEditor(false);
    setFeedScoreStatus("");
    setFeedScoreEditor(true);
    const songs = await loadFeedScoreLibrary();
    if (!songs.length) {
      setFeedScoreStatus("불러올 수 있는 악보가 아직 없어요.", true);
      return;
    }
    renderFeedScoreSuggestions(searchFeedScores($("#feedScoreInput")?.value || ""));
  });

  $("#feedLinkInput")?.addEventListener("input", (event) => {
    const value = event.currentTarget?.value || "";
    const url = normalizeLinkUrl(value);
    setFeedLinkStatus("");
    if (!url) {
      feedWriteLinkUrl = "";
      feedWriteLinkTitle = "";
      feedWriteLinkThumbnailUrl = "";
    renderFeedLinkPreview("", "", "");
    return;
  }
    feedWriteLinkUrl = url;
      tryRenderFeedLinkPreview(value).catch(() => {});
  });

  $("#feedLinkCancelBtn")?.addEventListener("click", () => {
    feedWriteLinkUrl = "";
    feedWriteLinkTitle = "";
    feedWriteLinkThumbnailUrl = "";
    const input = $("#feedLinkInput");
    if (input) input.value = "";
    renderFeedLinkPreview("", "", "");
    setFeedLinkStatus("");
    setFeedLinkEditor(false);
  });

  $("#feedScoreInput")?.addEventListener("input", async (event) => {
    await loadFeedScoreLibrary();
    setFeedScoreStatus("");
    renderFeedScoreSuggestions(searchFeedScores(event.currentTarget?.value || ""));
  });

  $("#feedScoreInput")?.addEventListener("focus", async (event) => {
    await loadFeedScoreLibrary();
    renderFeedScoreSuggestions(searchFeedScores(event.currentTarget?.value || ""));
  });

  $("#feedScoreCancelBtn")?.addEventListener("click", () => {
    setFeedScoreEditor(false);
  });

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

  document.addEventListener("click", (event) => {
    const editor = $("#feedScoreEditor");
    const trigger = $("#feedScorePickerBtn");
    if (!editor || !trigger || editor.classList.contains("hidden")) return;
    if (editor.contains(event.target) || trigger.contains(event.target)) return;
    setFeedScoreEditor(false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderFeedPosts().catch(() => {});
  bindFeedCompose();
  syncFeedWriteSubmitState();
});
