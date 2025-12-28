// src/auth/auth.js
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences"; // ✅ ADD
import { createPKCE } from "./pkce";

const API_BASE = import.meta.env.VITE_API_BASE;
if (!API_BASE) throw new Error("VITE_API_BASE is missing (must be approuter URL)");

const XSUAA_URL = "https://nav-payg-btp-3oqfixeo.authentication.us10.hana.ondemand.com";
const CLIENT_ID = "sb-sky-road!t262458";
const REDIRECT_URI = "com.example.app://login/callback";

const TOKEN_KEY = "auth_token"; // ✅ ADD

let listenerRegistered = false;
let tokenCallback = null;
let exchanging = false;

// ✅ ADD: store token
async function saveToken(token) {
  await Preferences.set({ key: TOKEN_KEY, value: JSON.stringify(token) });
}

// ✅ ADD: read token
export async function loadToken() {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value ? JSON.parse(value) : null;
}

// ✅ ADD: clear token (logout)
export async function clearToken() {
  await Preferences.remove({ key: TOKEN_KEY });
}

export async function loginPKCE(onToken) {
  console.log("AUTH: loginPKCE called");
  tokenCallback = onToken;

  // ✅ optional: prevent double-login triggers
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
      console.log("AUTH: appUrlOpen =", url);
      if (!url) return;

      let u;
      try {
        u = new URL(url);
      } catch (e) {
        console.log("AUTH: Invalid URL", e);
        return;
      }

      if (u.protocol !== "com.example.app:") return;
      if (u.host !== "login") return;
      if (u.pathname !== "/callback") return;

      const code = u.searchParams.get("code");
      console.log("AUTH: code =", code);

      try { await Browser.close(); } catch (_) {}

      if (!code) return;

      const verifierStored = sessionStorage.getItem("pkce_verifier");
      console.log("AUTH: verifier exists =", !!verifierStored);
      if (!verifierStored) return;

      if (exchanging) return; // ✅ guard
      exchanging = true;

      try {
        const token = await exchangeCode(code, verifierStored);

        // ✅ STORE TOKEN HERE
        await saveToken(token);

        console.log("AUTH: token stored");
        tokenCallback?.(token);
      } catch (e) {
        console.log("AUTH: exchangeCode failed:", String(e));
      } finally {
        exchanging = false;
      }
    });
  }

  console.log("AUTH: Opening SAP login", authUrl);
  await Browser.open({ url: authUrl }).catch((e) =>
    console.log("AUTH: Browser.open error", e)
  );
}

async function exchangeCode(code, verifier) {
  const url = `${API_BASE}/auth/exchange`;

  const res = await CapacitorHttp.post({
    url,
    headers: { "Content-Type": "application/json" },
    data: { code, verifier, redirect_uri: REDIRECT_URI },
  });

  if (res.status < 200 || res.status >= 300) {
    const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(msg);
  }

  return res.data;
}

export async function getAccessToken() {
  const t = await loadToken();
  return t?.access_token || null;
}
