// src/auth/auth.js
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { createPKCE } from "./pkce";

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
      if (!url?.startsWith(REDIRECT_URI)) return;

      await Browser.close();

      const code = new URL(url).searchParams.get("code");
      if (!code) return;

      const verifier = sessionStorage.getItem("pkce_verifier");
      const token = await exchangeCode(code, verifier);

      tokenCallback?.(token);
    });
  }
  
  console.log("AUTH: Opening SAP login", authUrl);
  await Browser.open({ url: authUrl });
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(`${XSUAA_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json(); // access_token, expires_in, refresh_token (if enabled)
}
