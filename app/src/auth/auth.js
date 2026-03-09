// src/auth/auth.js
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { createPKCE } from "./pkce";

const API_BASE = import.meta.env.VITE_API_BASE;
if (!API_BASE) throw new Error("VITE_API_BASE is missing (must be approuter URL)");

const XSUAA_URL =
  "https://nav-payg-btp-3oqfixeo.authentication.us10.hana.ondemand.com";
const CLIENT_ID = "sb-sky-road!t262458";
const REDIRECT_URI = "com.example.app://login/callback";

const TOKEN_KEY = "auth_token";

let listenerRegistered = false;
let exchanging = false;

/* =============================================================================
   Token persistence
============================================================================= */

async function saveToken(tokenObj) {
  await Preferences.set({ key: TOKEN_KEY, value: JSON.stringify(tokenObj) });
}

export async function loadToken() {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value ? JSON.parse(value) : null;
}

export async function clearToken() {
  await Preferences.remove({ key: TOKEN_KEY });
}

/* =============================================================================
   JWT expiry helpers
============================================================================= */

const nowSec = () => Math.floor(Date.now() / 1000);

function base64UrlDecode(str) {
  try {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return atob(s + pad);
  } catch {
    return null;
  }
}

function getJwtPayload(token) {
  try {
    const part = token?.split?.(".")?.[1];
    if (!part) return null;
    const json = base64UrlDecode(part);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(accessToken, skewSeconds = 60) {
  const payload = getJwtPayload(accessToken);
  if (!payload?.exp) return true;
  return payload.exp <= nowSec() + skewSeconds;
}

/* =============================================================================
   PKCE login
============================================================================= */

export async function loginPKCE(onToken) {
  if (exchanging) return;

  const { verifier, challenge } = await createPKCE();
  sessionStorage.setItem("pkce_verifier", verifier);

  const authUrl =
    `${XSUAA_URL}/oauth/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;

  if (!listenerRegistered) {
    listenerRegistered = true;

    App.addListener("appUrlOpen", async ({ url }) => {
      if (!url) return;

      let u;
      try {
        u = new URL(url);
      } catch {
        return;
      }

      if (u.protocol !== "com.example.app:") return;
      if (u.host !== "login") return;
      if (u.pathname !== "/callback") return;

      const code = u.searchParams.get("code");
      if (!code) return;

      try {
        await Browser.close();
      } catch (_) {}

      const verifierStored = sessionStorage.getItem("pkce_verifier");
      if (!verifierStored) return;

      if (exchanging) return;
      exchanging = true;

      try {
        const token = await exchangeCode(code, verifierStored);
        await saveToken(token);
        onToken?.(token);
      } catch (e) {
        console.error("AUTH: exchangeCode failed", e);
      } finally {
        exchanging = false;
      }
    });
  }

  await Browser.open({ url: authUrl }).catch((e) =>
    console.log("AUTH: Browser.open error", e)
  );
}

/* =============================================================================
   Exchange code -> token (via approuter route /auth/exchange)
============================================================================= */

async function exchangeCode(code, verifier) {
  const res = await CapacitorHttp.post({
    url: `${API_BASE}/auth/exchange`,
    headers: { "Content-Type": "application/json" },
    data: { code, verifier, redirect_uri: REDIRECT_URI },
  });

  if (res.status < 200 || res.status >= 300) {
    const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(msg);
  }

  return res.data; // { access_token, refresh_token, expires_in, ... }
}

/* =============================================================================
   Refresh token
============================================================================= */

async function refreshViaBackend(refreshTokenValue) {
  const res = await CapacitorHttp.post({
    url: `${API_BASE}/auth/refresh`,
    headers: { "Content-Type": "application/json" },
    data: { refresh_token: refreshTokenValue },
  });

  if (res.status < 200 || res.status >= 300) {
    const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(msg || "Refresh failed");
  }

  return res.data;
}

/* =============================================================================
   Public function for API layer (native)
============================================================================= */

export async function getValidAccessToken() {
  const tokenObj = await loadToken();
  const access = tokenObj?.access_token || null;
  const refresh = tokenObj?.refresh_token || null;

  if (!access) return null;

  // Still valid
  if (!isTokenExpired(access)) return access;

  // Expired, try refresh
  if (!refresh) {
    await clearToken();
    return null;
  }

  try {
    const refreshed = await refreshViaBackend(refresh);

    // Some providers may not return refresh_token every time
    const merged = {
      ...tokenObj,
      ...refreshed,
      refresh_token: refreshed.refresh_token || refresh,
    };

    await saveToken(merged);
    return merged.access_token || null;
  } catch (e) {
    console.warn("AUTH: refresh failed, clearing token", String(e));
    await clearToken();
    return null;
  }
}
