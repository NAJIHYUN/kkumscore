/*
 * Copyright (c) 2026 꿈꾸는교회 중고등부 찬양팀.
 * All rights reserved.
 */
const $ = (s) => document.querySelector(s);

let myInfoPasswordUpdating = false;

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

  $("#myInfoNickname").textContent = nickname;
  $("#myInfoEmail").textContent = email;
  $("#btnMyInfoPackages").href = "./my-packages.html";

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
}

init().catch((err) => {
  console.error("my info page 초기화 실패:", err);
  setMyInfoStatus("나의 정보를 불러오는 중 오류가 발생했습니다.", true);
});
