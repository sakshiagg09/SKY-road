// src/auth/auth.js
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { createPKCE } from "./pkce";

const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;

const XSUAA_URL =
  "https://nav-payg-btp-3oqfixeo.authentication.us10.hana.ondemand.com";
const CLIENT_ID = "sb-sky-road!t262458";
const REDIRECT_URI = "com.example.app://login/callback";

let listenerRegistered = false;
let tokenCallback = null;

export async function loginPKCE(onToken) {
  console.log("AUTH: loginPKCE called");
  tokenCallback = onToken;

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

      // ✅ Robust match for: com.example.app://login/callback
      if (u.protocol !== "com.example.app:") return;
      if (u.host !== "login") return;
      if (u.pathname !== "/callback") return;

      const code = u.searchParams.get("code");
      console.log("AUTH: code =", code);

      // close browser if opened
      try {
        await Browser.close();
      } catch (e) {
        // ignore
      }

      if (!code) return;

      const verifierStored = sessionStorage.getItem("pkce_verifier");
      console.log("AUTH: verifier exists =", !!verifierStored);
      if (!verifierStored) return;

      try {
        const token = await exchangeCode(code, verifierStored);
        console.log("AUTH: token received");
        tokenCallback?.(token);
      } catch (e) {
        console.log("AUTH: exchangeCode failed:", String(e));
      }
    });
  }

  console.log("AUTH: Opening SAP login", authUrl);
  await Browser.open({ url: authUrl }).catch((e) =>
    console.log("AUTH: Browser.open error", e)
  );
}


async function exchangeCode(code, verifier) {
  const res = await fetch(`${API_BASE}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
