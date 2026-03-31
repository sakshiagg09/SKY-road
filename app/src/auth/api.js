// src/auth/api.js
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { getValidAccessToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE;
const SRV  = import.meta.env.VITE_API_SRV;
const isNative = Capacitor.isNativePlatform();

function resolveUrl(path) {
  if (path.startsWith("http")) return path;

  // Native must hit full approuter URL
  if (isNative) return `${SRV}${path}`;

  // Browser (running under approuter) uses relative URLs
  return path;
}

async function buildHeaders(extra = {}, token = null) {
  // In browser/approuter mode you normally don't need Authorization header
  // but leaving it empty avoids any side effects.
  if (!isNative) return { ...extra };

  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function throwHttpError(res) {
  const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  throw new Error(msg);
}

export async function apiGet(path) {
  const url = resolveUrl(path);
    console.log("[apiPost] URL:", url);
  console.log("[apiPost] isNative:", isNative);
  // ============================
  // Native (Android / iOS)
  // ============================
  if (isNative) {
    let token = await getValidAccessToken();
    console.log("[apiPost] token present:", !!token);
    console.log("[API GET] URL:", url);
    console.log("[API GET] Has token:", !!token);

    let res = await CapacitorHttp.get({
      url,
      headers: await buildHeaders({}, token),
      connectTimeout: 15000,
      readTimeout: 20000,
    });

    console.log("[API GET] First response status:", res.status);
    console.log("[API GET] First response data:", JSON.stringify(res.data));

    // Retry once on 401 (token refresh happens inside)
    if (res.status === 401) {
      console.warn("[API GET] 401 received, retrying after refresh");

      token = await getValidAccessToken();
      console.log("[apiPost] retry token present:", !!token);

      res = await CapacitorHttp.get({
        url,
        headers: await buildHeaders({}, token),
        connectTimeout: 15000,
        readTimeout: 20000,
      });

      console.log("[API GET] Retry response status:", res.status);
      console.log("[API GET] Retry response data:", res.data);
    }

    if (res.status < 200 || res.status >= 300) {
      console.error("[API GET] Final error response:", res);
      throwHttpError(res);
    }

    return res.data;
  }

  // ============================
  // Browser (Approuter / Web)
  // ============================
  console.log("[API GET][WEB] URL:", url);

  const res = await CapacitorHttp.get({ url, headers: {} });

  console.log("[API GET][WEB] Status:", res.status);
  console.log("[API GET][WEB] Data:", res.data);

  if (res.status < 200 || res.status >= 300) throwHttpError(res);

  return res.data;
}

export async function apiPost(path, body) {
  const url = resolveUrl(path);

  console.log("[apiPost] URL:", url);
  console.log("[apiPost] isNative:", isNative);
  console.log("[apiPost] body:", body);

  if (isNative) {
    let token = await getValidAccessToken();
    console.log("[apiPost] token present:", !!token);

    let res = await CapacitorHttp.post({
      url,
      headers: await buildHeaders({ "Content-Type": "application/json" }, token),
      data: body,
      connectTimeout: 15000,
      readTimeout: 20000,
    });

    console.log("[apiPost] first status:", res.status);
    console.log("[apiPost] first data:", res.data);

    if (res.status === 401) {
      console.warn("[apiPost] 401, retrying with refreshed token");
      token = await getValidAccessToken();
      console.log("[apiPost] retry token present:", !!token);

      res = await CapacitorHttp.post({
        url,
        headers: await buildHeaders({ "Content-Type": "application/json" }, token),
        data: body,
        connectTimeout: 15000,
        readTimeout: 20000,
      });

      console.log("[apiPost] retry status:", res.status);
      console.log("[apiPost] retry data:", res.data);
    }

    if (res.status < 200 || res.status >= 300) {
      console.error("[apiPost] ERROR response:", res);
      throwHttpError(res);
    }

    return res.data;
  }

  // Web
  const res = await CapacitorHttp.post({
    url,
    headers: { "Content-Type": "application/json" },
    data: body,
  });

  console.log("[apiPost][WEB] status:", res.status);
  console.log("[apiPost][WEB] data:", res.data);

  if (res.status < 200 || res.status >= 300) throwHttpError(res);
  return res.data;
}
