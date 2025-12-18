import { Capacitor } from "@capacitor/core";
import { CapacitorHttp } from "@capacitor/core";

export async function httpJson(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = options.headers || {};
  const body = options.body;

  // WEB: normal fetch
  if (!Capacitor.isNativePlatform()) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }

  // NATIVE: CapacitorHttp (bypasses CORS)
  const resp = await CapacitorHttp.request({
    url,
    method,
    headers,
    data: body ? JSON.parse(body) : undefined,
  });

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status}: ${typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data)}`);
  }

  return resp.data; // already JSON (usually)
}
