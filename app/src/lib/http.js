import { Capacitor } from "@capacitor/core";
import { CapacitorHttp } from "@capacitor/core";

export async function httpJson(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  // Normalize headers (avoid accidental mutation)
  const headers = { ...(options.headers || {}) };

  // Allow callers to pass a token without repeating boilerplate
  if (options.authToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${options.authToken}`;
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
