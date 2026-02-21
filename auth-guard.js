(function () {
  const ALLOW_PATHS = ["/auth.html"];

  function currentPath() {
    return location.pathname;
  }

  function shouldSkipGuard() {
    const path = currentPath();
    return ALLOW_PATHS.some((p) => path.endsWith(p));
  }

  function redirectToAuth() {
    const next = `${location.pathname}${location.search}`;
    location.replace(`./auth.html?next=${encodeURIComponent(next)}`);
  }

  async function getProfile(client, userId) {
    try {
      const { data, error } = await client
        .from("profiles")
        .select("id, approved, role")
        .eq("id", userId)
        .maybeSingle();
      if (error) return null;
      return data || null;
    } catch {
      return null;
    }
  }

  async function showLogoutIfExists(client) {
    const btn = document.querySelector("#btnLogout");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = confirm("로그아웃 하시겠습니까?");
      if (!ok) return;
      try {
        await client.auth.signOut();
      } catch {}
      redirectToAuth();
    });
  }

  async function runGuard() {
    if (shouldSkipGuard()) return;
    if (!window.SB || !window.SB.isConfigured()) return;

    const client = window.SB.getClient();
    if (!client) return;

    const { data } = await client.auth.getSession();
    const session = data?.session || null;
    if (!session) {
      redirectToAuth();
      return;
    }

    const profile = await getProfile(client, session.user.id);
    if (profile && profile.approved === false) {
      try {
        await client.auth.signOut();
      } catch {}
      alert("관리자 승인 후 이용 가능합니다.");
      redirectToAuth();
      return;
    }

    await showLogoutIfExists(client);
  }

  document.addEventListener("DOMContentLoaded", () => {
    runGuard().catch(() => {});
  });
})();
