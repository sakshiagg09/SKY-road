import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";

export async function httpJson(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  // Normalize headers (avoid accidental mutation)
  const headers = { ...(options.headers || {}) };

  // Allow callers to pass a token without repeating boilerplate
  if (options.authToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  // If caller didn't pass a token explicitly, try using the stored token (mobile PKCE flow)
  if (!headers.Authorization) {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
    if (stored) headers.Authorization = `Bearer ${stored}`;
  }

  // Default Accept header
  if (!headers.Accept) {
    headers.Accept = "application/json";
  }

  const body = options.body;

  // WEB: normal fetch
  if (!Capacitor.isNativePlatform()) {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }

  // NATIVE: CapacitorHttp (bypasses CORS)
  // CapacitorHttp returns `data` as an object for JSON responses in most cases,
  // but may return a string (e.g., text/html login redirect page).
  let data;
  try {
    if (body !== undefined && body !== null && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await CapacitorHttp.request({
      url,
      method,
      headers,
      // If caller provided a string body, try to parse as JSON; otherwise pass through
      data:
        body === undefined || body === null
          ? undefined
          : typeof body === "string"
            ? JSON.parse(body)
            : body,
    });

    const status = resp.status;
    const respHeaders = resp.headers || {};
    const contentType =
      respHeaders["content-type"] ||
      respHeaders["Content-Type"] ||
      "";

    if (status < 200 || status >= 300) {
      const errPayload =
        typeof resp.data === "string"
          ? resp.data
          : JSON.stringify(resp.data);
      throw new Error(`HTTP ${status}: ${errPayload}`);
    }

    // Detect common "HTML login" responses (BTP/XSUAA redirect pages often come back as 200 text/html)
    if (
      typeof resp.data === "string" &&
      (contentType.includes("text/html") ||
        resp.data.trim().toLowerCase().startsWith("<html") ||
        resp.data.trim().toLowerCase().startsWith("<!doctype"))
    ) {
      throw new Error(
        "Unauthenticated request: received HTML (likely a login redirect). Ensure you attach a valid Bearer token or session cookies for this endpoint."
      );
    }

    // If we got JSON as string, parse it
    if (typeof resp.data === "string") {
      const trimmed = resp.data.trim();
      data = trimmed ? JSON.parse(trimmed) : null;
    } else {
      data = resp.data;
    }
  } catch (e) {
    // Improve error messaging for JSON parsing problems
    if (e instanceof SyntaxError) {
      throw new Error(
        `Failed to parse JSON response from ${url}. This often means the backend returned HTML/text (e.g., login page). Original error: ${e.message}`
      );
    }
    throw e;
  }

  return data;
}

// -----------------------------
// OAuth Authorization Code + PKCE (mobile)
// -----------------------------

const XSUAA_BASE = import.meta.env.VITE_XSUAA_BASE;
const OAUTH_CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID;
const OAUTH_REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI;
const OAUTH_SCOPE = import.meta.env.VITE_OAUTH_SCOPE;

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

export function getAccessToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
}

export async function logout() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("pkce_verifier");
    localStorage.removeItem("pkce_state");
  }
}

// Opens the system browser to start login (Authorization Code + PKCE)
export async function startPkceLogin() {
  if (!XSUAA_BASE || !OAUTH_CLIENT_ID || !OAUTH_REDIRECT_URI || !OAUTH_SCOPE) {
    throw new Error(
      "Missing OAuth env vars. Set VITE_XSUAA_BASE, VITE_OAUTH_CLIENT_ID, VITE_OAUTH_REDIRECT_URI, and VITE_OAUTH_SCOPE in .env"
    );
  }

  // Only meaningful on native; on web you likely use approuter login.
  if (!Capacitor.isNativePlatform()) {
    throw new Error("PKCE login is intended for native mobile builds.");
  }

  const verifier = randomString(64);
  const challenge = b64urlFromArrayBuffer(await sha256(verifier));
  const state = randomString(16);

  localStorage.setItem("pkce_verifier", verifier);
  localStorage.setItem("pkce_state", state);

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
  if (!XSUAA_BASE || !OAUTH_CLIENT_ID || !OAUTH_REDIRECT_URI || !OAUTH_SCOPE) {
    throw new Error(
      "Missing OAuth env vars. Set VITE_XSUAA_BASE, VITE_OAUTH_CLIENT_ID, VITE_OAUTH_REDIRECT_URI, and VITE_OAUTH_SCOPE in .env"
    );
  }

  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get("code");
  const returnedState = parsed.searchParams.get("state");

  const expectedState = localStorage.getItem("pkce_state");
  const verifier = localStorage.getItem("pkce_verifier");

  if (!code) throw new Error("Login failed: no authorization code returned.");
  if (!verifier) throw new Error("Login failed: missing PKCE verifier.");
  if (returnedState !== expectedState) throw new Error("Login failed: invalid state.");

  const tokenUrl = `${XSUAA_BASE}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OAUTH_CLIENT_ID,
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_verifier: verifier,
  });

  let json;

  if (Capacitor.isNativePlatform()) {
    const resp = await CapacitorHttp.request({
      url: tokenUrl,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // Send the form body as a raw string
      data: body.toString(),
    });

    // CapacitorHttp returns parsed JSON for application/json responses
    json = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;

    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
    }
  } else {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
    }
  }

  if (json.access_token) localStorage.setItem("access_token", json.access_token);
  if (json.refresh_token) localStorage.setItem("refresh_token", json.refresh_token);

  return json.access_token;
}

// Call this once at app startup to capture OAuth redirect deep links
export function initPkceRedirectListener() {
  // No-op on web
  if (!Capacitor.isNativePlatform()) return;

  CapApp.addListener("appUrlOpen", async (event) => {
    const url = event?.url || "";
    if (!url) return;

    console.log("OAuth redirect received:", url);

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
