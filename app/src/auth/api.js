// src/auth/api.js
import { Capacitor } from "@capacitor/core";
import { CapacitorHttp } from "@capacitor/core";
import { loadToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE;

// Detect native platform
const isNative = Capacitor.isNativePlatform();

// Resolve URL correctly
function resolveUrl(path) {
  if (path.startsWith("http")) return path;
  if (isNative) return `${API_BASE}${path}`;
  return path; // browser / approuter
}

// Helper to get access token
async function getAccessToken() {
  const token = await loadToken();
  return token?.access_token || null;
}

export async function apiGet(path) {
  const token = await getAccessToken();

  const res = await CapacitorHttp.get({
    url: resolveUrl(path),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      typeof res.data === "string" ? res.data : JSON.stringify(res.data)
    );
  }

  return res.data;
}

export async function apiPost(path, body) {
  const token = await getAccessToken();

  const res = await CapacitorHttp.post({
    url: resolveUrl(path),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: body,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      typeof res.data === "string" ? res.data : JSON.stringify(res.data)
    );
  }

  return res.data;
}
