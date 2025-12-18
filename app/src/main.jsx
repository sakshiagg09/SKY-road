// Call this once at app startup to capture OAuth redirect deep links
export function initPkceRedirectListener() {
  // No-op on web
  if (!Capacitor.isNativePlatform()) return;

  CapApp.addListener("appUrlOpen", async (event) => {
    const url = event?.url || "";
    if (!url) return;

    // Only handle our redirect
    if (!OAUTH_REDIRECT_URI || !url.startsWith(OAUTH_REDIRECT_URI)) return;

    try {
      await Browser.close();
      await exchangeCodeForToken(url);
      console.log("OAuth login successful: token stored");
    } catch (e) {
      console.error("OAuth callback handling failed", e);
    }
  });
}

export { initPkceRedirectListener };
