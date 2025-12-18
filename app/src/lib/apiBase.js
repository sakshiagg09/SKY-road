// app/src/lib/apiBase.js

const APROUTER_BASE =
  "https://nav-it-consulting-gmbh-nav-payg-btp-3oqfixeo-dev-sky-ro70256e00.cfapps.us10-001.hana.ondemand.com";

// detect Capacitor native (Android/iOS)
const isNative =
  !!window?.Capacitor?.isNativePlatform?.() ||
  !!window?.Capacitor?.getPlatform?.(); // fallback for older setups

// browser local dev (vite)
const isBrowserLocalDev =
  !isNative &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// BASE rules:
// - Native app -> ALWAYS call approuter
// - Browser local dev -> "" (use Vite proxy /odata -> localhost:4004)
// - Browser prod (hosted) -> either env var or same-origin "" (your choice)
const BASE = isNative
  ? APROUTER_BASE
  : isBrowserLocalDev
  ? ""
  : (import.meta.env.VITE_API_BASE || ""); // optional

export const apiUrl = (path) => {
  const base = String(BASE).replace(/\/+$/, ""); // remove trailing /
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
};
