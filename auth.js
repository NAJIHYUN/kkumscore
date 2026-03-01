/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);

function nextPath() {
  const url = new URL(location.href);
  const n = url.searchParams.get("next") || "./index.html";
  return n;
}

function getAuthRedirectUrl() {
  return new URL("./auth.html", location.href).toString();
}

function setStatus(msg, isError = false) {
  const el = $("#authStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#d32f2f" : "#666";
}

function validateNickname(nickname = "") {
  const value = String(nickname).trim();
  if (!value) return "닉네임을 입력해 주세요.";
  if (value.length >= 10) return "닉네임은 10글자 미만으로 입력해 주세요.";
  if (!/^[A-Za-z가-힣]+$/.test(value)) return "닉네임은 한글/영문만 사용할 수 있어요.";
  return "";
}

function validateEmail(email = "") {
  const value = String(email).trim();
  if (!value) return "이메일을 입력해 주세요.";
  // practical email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "올바른 이메일 형식으로 입력해 주세요.";
  return "";
}

function validatePassword(password = "") {
  const value = String(password);
  if (!value) return "비밀번호를 입력해 주세요.";
  if (value.length < 5 || value.length > 15) return "비밀번호는 5~15자로 입력해 주세요.";
  if (!/^[A-Za-z0-9!@#]+$/.test(value)) return "비밀번호는 영문/숫자/!@#만 사용할 수 있어요.";
  return "";
}

function setupContactAdmin() {
  const btn = $("#btnContactAdmin");
  const messageEl = $("#contactMessage");
  if (!btn || !messageEl) return;

  btn.addEventListener("click", () => {
    const body = String(messageEl.value || "").trim();
    if (!body) {
      setStatus("문의 내용을 입력해 주세요.", true);
      return;
    }
    const to = "emily_1004@naver.com";
    const mailto = `mailto:${to}?body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  });
}

function setupPasswordPeek() {
  const pw = $("#authPassword");
  if (!pw) return;
  let real = "";
  pw.type = "text";
  pw.autocapitalize = "off";
  pw.autocomplete = "off";
  pw.spellcheck = false;

  function render(showLast = true) {
    pw.dataset.realPassword = real;
    if (!real) {
      pw.value = "";
      return;
    }
    if (!showLast) {
      pw.value = "•".repeat(real.length);
      return;
    }
    pw.value = real.length === 1 ? real : `${"•".repeat(real.length - 1)}${real.slice(-1)}`;
  }

  function placeCaretEnd() {
    try {
      const end = pw.value.length;
      pw.setSelectionRange(end, end);
    } catch {}
  }

  function clearAll() {
    real = "";
    pw.dataset.realPassword = "";
    pw.value = "";
  }

  function clearIfPending() {
    if (pw.dataset.clearOnNextFocus === "1") {
      clearAll();
      pw.dataset.clearOnNextFocus = "0";
    }
  }

  pw.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      real = real.slice(0, -1);
      render(true);
      placeCaretEnd();
      return;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
      real += e.key;
      render(true);
      placeCaretEnd();
    }
  });

  pw.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text") || "";
    if (!text) return;
    real += text;
    render(true);
    placeCaretEnd();
  });

  pw.addEventListener("focus", () => {
    clearIfPending();
    render(true);
    placeCaretEnd();
  });

  pw.addEventListener("click", () => {
    clearIfPending();
    placeCaretEnd();
  });

  pw.addEventListener("blur", () => {
    render(false);
    // 입력창을 벗어났다가 다시 들어올 때는 새로 입력하도록 초기화 예약
    if (real.length > 0) pw.dataset.clearOnNextFocus = "1";
  });
  render(false);
}

async function getMyProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select("id, approved, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function ensureApprovedOrSignOut(client, session) {
  const profile = await getMyProfile(client, session.user.id);
  if (profile && profile.approved === false) {
    await client.auth.signOut();
    setStatus("관리자 승인 후 이용 가능합니다.", true);
    return false;
  }
  return true;
}

async function isRegisteredEmail(client, email) {
  try {
    const { data, error } = await client.rpc("is_registered_email", { p_email: email });
    if (error) return null;
    return !!data;
  } catch {
    return null;
  }
}

async function initAuth() {
  if (!window.SB || !window.SB.isConfigured()) {
    setStatus("Supabase 설정이 비어 있습니다. supabase-config.js를 먼저 입력하세요.", true);
    return;
  }

  const client = window.SB.getClient();
  if (!client) {
    setStatus("Supabase 클라이언트를 초기화하지 못했습니다.", true);
    return;
  }

  const { data } = await client.auth.getSession();
  const current = data?.session || null;
  if (current) {
    const ok = await ensureApprovedOrSignOut(client, current);
    if (ok) {
      location.replace(nextPath());
      return;
    }
  }

  const emailInput = $("#authEmail");
  const nicknameInput = $("#authNickname");
  const pwInput = $("#authPassword");
  const pwConfirmInput = $("#authPasswordConfirm");
  const authFields = $("#authFields");
  const authSub = $("#authSub");
  const lineNickname = $("#lineNickname");
  const lineEmail = $("#lineEmail");
  const linePassword = $("#linePassword");
  const linePwConfirm = $("#linePasswordConfirm");
  const emailLabel = lineEmail?.querySelector("span");
  const btnEnterIn = $("#btnEnterSignIn");
  const btnEnterUp = $("#btnEnterSignUp");
  const btnSubmitIn = $("#btnSubmitSignIn");
  const btnSubmitUp = $("#btnSubmitSignUp");
  const forgotLink = $("#forgotPasswordLink");
  const btnSwitchMode = $("#btnSwitchMode");
  const btnBackIntro = $("#btnBackIntro");
  const intro = $("#authIntro");
  const step = $("#authStep");
  const introActions = $("#introActions");
  const modeActions = $("#authModeActions");
  let authMode = "";

  function isHidden(el) {
    if (!el) return true;
    if (el.classList.contains("hidden")) return true;
    const parentHidden = el.closest(".hidden");
    return !!parentHidden;
  }

  function updateEnterKeyHints() {
    if (!nicknameInput || !emailInput || !pwInput || !pwConfirmInput) return;
    if (authMode === "signin") {
      emailInput.enterKeyHint = "next";
      pwInput.enterKeyHint = "go";
      return;
    }
    if (authMode === "signup") {
      nicknameInput.enterKeyHint = "next";
      emailInput.enterKeyHint = "next";
      pwInput.enterKeyHint = "next";
      pwConfirmInput.enterKeyHint = "go";
    }
  }

  function focusNextVisible(inputs, current) {
    const currentIndex = inputs.indexOf(current);
    if (currentIndex < 0) return false;
    for (let i = currentIndex + 1; i < inputs.length; i += 1) {
      const next = inputs[i];
      if (!isHidden(next)) {
        next.focus();
        return true;
      }
    }
    return false;
  }

  function setupInputEnterNavigation() {
    const signInOrder = [emailInput, pwInput];
    const signUpOrder = [nicknameInput, emailInput, pwInput, pwConfirmInput];
    const allInputs = [nicknameInput, emailInput, pwInput, pwConfirmInput].filter(Boolean);

    allInputs.forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        if (isHidden(input)) return;

        const order = authMode === "signup" ? signUpOrder : signInOrder;
        const moved = focusNextVisible(order, input);
        if (moved) {
          e.preventDefault();
          return;
        }

        e.preventDefault();
        if (authMode === "signup") {
          btnSubmitUp?.click();
          return;
        }
        btnSubmitIn?.click();
      });
    });
  }

  function openAuthForm() {
    intro?.classList.add("hidden");
    introActions?.classList.add("hidden");
    step?.classList.remove("hidden");
    modeActions?.classList.remove("hidden");
  }

  function backToIntro() {
    authMode = "";
    step?.classList.add("hidden");
    intro?.classList.remove("hidden");
    introActions?.classList.remove("hidden");
    authFields?.classList.add("hidden");
    modeActions?.classList.add("hidden");
    btnSubmitIn?.classList.add("hidden");
    btnSubmitUp?.classList.add("hidden");
    forgotLink?.classList.add("hidden");
    btnSwitchMode?.classList.add("hidden");
    if (authSub) authSub.textContent = "처음 가입한 계정은 관리자 승인 후 이용 가능합니다.";
    setStatus("");
  }

  function enterLoginMode() {
    openAuthForm();
    authMode = "signin";
    if (authSub) authSub.textContent = "";
    authFields?.classList.remove("hidden");
    lineNickname?.classList.add("hidden");
    linePassword?.classList.remove("hidden");
    linePwConfirm?.classList.add("hidden");
    btnSubmitIn?.classList.remove("hidden");
    btnSubmitUp?.classList.add("hidden");
    forgotLink?.classList.remove("hidden");
    btnSwitchMode?.classList.remove("hidden");
    if (btnSwitchMode) btnSwitchMode.textContent = "회원가입으로 전환";
    if (emailLabel) emailLabel.textContent = "이메일";
    if (emailInput) {
      emailInput.placeholder = "이메일";
    }
    updateEnterKeyHints();
    setStatus("");
  }

  function enterSignUpMode() {
    openAuthForm();
    authMode = "signup";
    if (authSub) authSub.textContent = "처음 가입한 계정은 관리자 승인 후 이용 가능합니다.";
    authFields?.classList.remove("hidden");
    lineNickname?.classList.remove("hidden");
    linePassword?.classList.remove("hidden");
    linePwConfirm?.classList.remove("hidden");
    btnSubmitIn?.classList.add("hidden");
    btnSubmitUp?.classList.remove("hidden");
    forgotLink?.classList.add("hidden");
    btnSwitchMode?.classList.remove("hidden");
    if (btnSwitchMode) btnSwitchMode.textContent = "로그인으로 전환";
    if (emailLabel) emailLabel.textContent = "이메일";
    if (emailInput) {
      emailInput.placeholder = "이메일";
    }
    updateEnterKeyHints();
    setStatus("");
  }

  async function withPending(fn) {
    if (btnEnterIn) btnEnterIn.disabled = true;
    if (btnEnterUp) btnEnterUp.disabled = true;
    if (btnSubmitIn) btnSubmitIn.disabled = true;
    if (btnSubmitUp) btnSubmitUp.disabled = true;
    try {
      await fn();
    } finally {
      if (btnEnterIn) btnEnterIn.disabled = false;
      if (btnEnterUp) btnEnterUp.disabled = false;
      if (btnSubmitIn) btnSubmitIn.disabled = false;
      if (btnSubmitUp) btnSubmitUp.disabled = false;
    }
  }

  btnEnterIn?.addEventListener("click", enterLoginMode);
  btnEnterUp?.addEventListener("click", enterSignUpMode);
  btnBackIntro?.addEventListener("click", backToIntro);
  setupInputEnterNavigation();
  btnSwitchMode?.addEventListener("click", () => {
    if (authMode === "signin") {
      enterSignUpMode();
      return;
    }
    enterLoginMode();
  });

  btnSubmitIn?.addEventListener("click", () => withPending(async () => {
    const email = String(emailInput?.value || "").trim();
    const password = String(pwInput?.dataset.realPassword || pwInput?.value || "");
    if (!email || !password) {
      setStatus("닉네임/이메일과 비밀번호를 입력해 주세요.", true);
      return;
    }

    const emailExists = await isRegisteredEmail(client, email);
    if (emailExists === false) {
      if (pwInput) pwInput.dataset.clearOnNextFocus = "1";
      setStatus("가입되지 않은 이메일 주소입니다.", true);
      return;
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      let loginErrorMessage = error?.message || "로그인에 실패했습니다.";
      if (error?.message === "Invalid login credentials") {
        loginErrorMessage = emailExists === true
          ? "비밀번호가 올바르지 않습니다."
          : "이메일 또는 비밀번호가 올바르지 않습니다.";
      }
      if (pwInput) {
        pwInput.dataset.clearOnNextFocus = "1";
      }
      setStatus(loginErrorMessage, true);
      return;
    }

    const ok = await ensureApprovedOrSignOut(client, data.session);
    if (!ok) return;
    location.replace(nextPath());
  }));

  btnSubmitUp?.addEventListener("click", () => withPending(async () => {
    const nickname = String(nicknameInput?.value || "").trim();
    const email = String(emailInput?.value || "").trim();
    const password = String(pwInput?.dataset.realPassword || pwInput?.value || "");
    const passwordConfirm = String(pwConfirmInput?.value || "").trim();
    const nicknameErr = validateNickname(nickname);
    if (nicknameErr) { setStatus(nicknameErr, true); return; }
    const emailErr = validateEmail(email);
    if (emailErr) { setStatus(emailErr, true); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setStatus(pwErr, true); return; }
    if (!passwordConfirm) { setStatus("비밀번호 확인을 입력해 주세요.", true); return; }
    if (password !== passwordConfirm) {
      setStatus("비밀번호와 비밀번호 확인이 일치하지 않습니다.", true);
      return;
    }

    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          nickname,
        },
      },
    });
    if (error) {
      setStatus(error.message || "회원가입에 실패했습니다.", true);
      return;
    }

    setStatus("회원가입 완료. 관리자 승인 후 로그인 가능합니다.");
  }));

  forgotLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = String(emailInput?.value || "").trim();
    if (!email || !email.includes("@")) {
      setStatus("비밀번호 재설정을 위해 이메일을 입력해 주세요.", true);
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });
    if (error) {
      setStatus(error.message || "비밀번호 재설정 메일 발송에 실패했습니다.", true);
      return;
    }
    setStatus("비밀번호 재설정 메일을 보냈어요.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupContactAdmin();
  setupPasswordPeek();
  initAuth().catch((err) => {
    console.error(err);
    setStatus("인증 초기화 중 오류가 발생했습니다.", true);
  });
});
