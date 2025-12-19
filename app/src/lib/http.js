// app/src/lib/http.js
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { apiUrl } from "./apiBase";
import { registerPlugin } from "@capacitor/core";

// ✅ Android SharedPreferences("auth") bridge (needed for TrackingService.java)
const AuthStore = registerPlugin("AuthStore");

// ---- keys
const K_ACCESS = "access_token";
const K_REFRESH = "refresh_token";
const K_PKCE_VERIFIER = "pkce_verifier";
const K_PKCE_STATE = "pkce_state";

// -----------------------------
// Storage helpers (native-safe)
// -----------------------------
async function prefGet(key) {
  const { value } = await Preferences.get({ key });
  return value ?? null;
}

async function prefSet(key, value) {
  if (value === undefined || value === null) return;
  await Preferences.set({ key, value: String(value) });
}

async function prefRemove(key) {
  await Preferences.remove({ key });
}

export async function getAccessToken() {
  if (Capacitor.isNativePlatform()) return await prefGet(K_ACCESS);
  return typeof localStorage !== "undefined" ? localStorage.getItem(K_ACCESS) : null;
}

async function setAccessToken(token) {
  if (Capacitor.isNativePlatform()) {
    await prefSet(K_ACCESS, token);
  } else if (typeof localStorage !== "undefined") {
    localStorage.setItem(K_ACCESS, token);
  }
}

async function setRefreshToken(token) {
  if (Capacitor.isNativePlatform()) {
    await prefSet(K_REFRESH, token);
  } else if (typeof localStorage !== "undefined") {
    localStorage.setItem(K_REFRESH, token);
  }
}

// ✅ IMPORTANT: write to Android SharedPreferences("auth") so TrackingService.java can read it
async function persistNativeAuth(accessToken, refreshToken) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await AuthStore.setTokens({
      accessToken,
      refreshToken: refreshToken || "",
    });
  } catch (e) {
    console.warn("AuthStore.setTokens failed (TrackingService may not authenticate):", e);
  }
}

export async function logout() {
  if (Capacitor.isNativePlatform()) {
    await prefRemove(K_ACCESS);
    await prefRemove(K_REFRESH);
    await prefRemove(K_PKCE_VERIFIER);
    await prefRemove(K_PKCE_STATE);

    // also clear Android SharedPreferences("auth")
    try {
      await AuthStore.clear();
    } catch (e) {
      console.warn("AuthStore.clear failed:", e);
    }
  } else if (typeof localStorage !== "undefined") {
    localStorage.removeItem(K_ACCESS);
    localStorage.removeItem(K_REFRESH);
    localStorage.removeItem(K_PKCE_VERIFIER);
    localStorage.removeItem(K_PKCE_STATE);
  }
}

export async function httpJson(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };

  // allow caller token
  if (options.authToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  // auto attach token
  if (!headers.Authorization) {
    const stored = await getAccessToken();
    if (stored) headers.Authorization = `Bearer ${stored}`;
  }

  if (!headers.Accept) headers.Accept = "application/json";

  const body = options.body;

  // WEB
  if (!Capacitor.isNativePlatform()) {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }

  // NATIVE
  try {
    if (body !== undefined && body !== null && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await CapacitorHttp.request({
      url,
      method,
      headers,
      data:
        body === undefined || body === null
          ? undefined
          : typeof body === "string"
            ? JSON.parse(body)
            : body,
    });

    const status = resp.status;
    const respHeaders = resp.headers || {};
    const contentType = respHeaders["content-type"] || respHeaders["Content-Type"] || "";

    if (status < 200 || status >= 300) {
      const errPayload = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
      throw new Error(`HTTP ${status} (${contentType}): ${errPayload}`);
    }

    // HTML login page detection
    if (
      typeof resp.data === "string" &&
      (contentType.includes("text/html") ||
        resp.data.trim().toLowerCase().startsWith("<html") ||
        resp.data.trim().toLowerCase().startsWith("<!doctype"))
    ) {
      const preview = resp.data.slice(0, 200);
      throw new Error(
        `Unauthenticated: received HTML (login redirect). content-type=${contentType}. preview=${preview}`
      );
    }

    if (typeof resp.data === "string") {
      const trimmed = resp.data.trim();
      return trimmed ? JSON.parse(trimmed) : null;
    }
    return resp.data;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON from ${url}. Backend returned HTML/text. ${e.message}`);
    }
    throw e;
  }
}

// -----------------------------
// OAuth Authorization Code + PKCE (mobile)
// -----------------------------
const XSUAA_BASE = import.meta.env.VITE_XSUAA_BASE;
const OAUTH_CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID;
const OAUTH_REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI;
const OAUTH_SCOPE = import.meta.env.VITE_OAUTH_SCOPE || "openid";

function b64urlFromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => charset[v % charset.length]).join("");
}

async function sha256(text) {
  return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

// Opens the system browser to start login (Authorization Code + PKCE)
export async function startPkceLogin() {
  if (!XSUAA_BASE || !OAUTH_CLIENT_ID || !OAUTH_REDIRECT_URI) {
    throw new Error("Missing OAuth env vars. Set VITE_XSUAA_BASE, VITE_OAUTH_CLIENT_ID, VITE_OAUTH_REDIRECT_URI.");
  }
  if (!Capacitor.isNativePlatform()) throw new Error("PKCE login is intended for native mobile builds.");

  const verifier = randomString(64);
  const challenge = b64urlFromArrayBuffer(await sha256(verifier));
  const state = randomString(16);

  await prefSet(K_PKCE_VERIFIER, verifier);
  await prefSet(K_PKCE_STATE, state);

  const authUrl =
    `${XSUAA_BASE}/oauth/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(OAUTH_SCOPE)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;

  await Browser.open({ url: authUrl });
}

export async function exchangeCodeForToken(callbackUrl) {
  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get("code");
  const returnedState = parsed.searchParams.get("state");

  const expectedState = await prefGet(K_PKCE_STATE);
  const verifier = await prefGet(K_PKCE_VERIFIER);

  if (!code) throw new Error("Login failed: no authorization code returned.");
  if (!verifier) throw new Error("Login failed: missing PKCE verifier.");
  if (returnedState !== expectedState) throw new Error("Login failed: invalid state.");

  // ✅ exchange happens on CAP backend, not directly with XSUAA
  const url = apiUrl("/api/auth/exchange");
  const json = await httpJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      code,
      code_verifier: verifier,
      redirect_uri: OAUTH_REDIRECT_URI,
    },
  });

  if (!json?.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);

  await setAccessToken(json.access_token);
  if (json.refresh_token) await setRefreshToken(json.refresh_token);

  // ✅ THIS is what makes TrackingService.java finally work
  await persistNativeAuth(json.access_token, json.refresh_token);

  return json.access_token;
}

// Call this once at app startup to capture OAuth redirect deep links
export function initPkceRedirectListener() {
  if (!Capacitor.isNativePlatform()) return;

  CapApp.addListener("appUrlOpen", async (event) => {
    const url = event?.url || "";
    if (!url) return;
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
