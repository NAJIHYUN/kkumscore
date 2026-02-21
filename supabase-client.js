(function () {
  function getConfig() {
    const cfg = window.SUPABASE_CONFIG || {};
    return {
      url: String(cfg.url || "").trim(),
      anonKey: String(cfg.anonKey || "").trim(),
    };
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return !!url && !!anonKey;
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    if (!window.__sbClient) {
      const { url, anonKey } = getConfig();
      window.__sbClient = window.supabase.createClient(url, anonKey);
    }
    return window.__sbClient;
  }

  window.SB = {
    getConfig,
    isConfigured,
    getClient,
  };
})();
