const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

const DESTINATION = "Sky_App";

const cookieFromSetCookie = (setCookie) => {
  if (!setCookie) return "";
  const a = Array.isArray(setCookie) ? setCookie : [setCookie];
  return a.map((c) => c.split(";")[0]).join("; ");
};

async function fetchCsrf() {
  const res = await executeHttpRequest(
    { destinationName: DESTINATION },
    {
      method: "GET",
      url: "/$metadata",              // <-- relative to destination URL
      headers: { "x-csrf-token": "Fetch" }
    },
    { fetchCsrfToken: false }
  );

  const token = res.headers?.["x-csrf-token"];
  const cookie = cookieFromSetCookie(res.headers?.["set-cookie"]);
  if (!token) throw new Error("No x-csrf-token returned from backend.");
  if (!cookie) throw new Error("No session cookie returned (set-cookie missing).");

  return { token, cookie };
}

async function s4Get(url) {
  const res = await executeHttpRequest(
    { destinationName: DESTINATION },
    { method: "GET", url, headers: { Accept: "application/json" } },
    { fetchCsrfToken: false }
  );
  return res.data?.d ?? res.data;
}

async function s4Post(url, payload) {
  const { token, cookie } = await fetchCsrf();

  const res = await executeHttpRequest(
    { destinationName: DESTINATION },
    {
      method: "POST",
      url,                            // <-- relative to destination URL
      data: payload,
      headers: {
        "x-csrf-token": token,
        Cookie: cookie,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    },
    { fetchCsrfToken: false }
  );

  return res.data?.d ?? res.data;
}

module.exports = cds.service.impl(function () {
  const { trackingDetails, eventReporting } = this.entities;

  this.on("READ", trackingDetails, async (req) => {
    const foId = req.query.SELECT.where?.[2]?.val;
    const data = await s4Get(`/SearchFOSet('${foId}')?$format=json`);
    const row = data?.results?.[0] ?? data;
    return row ? [{ FoId: row.FoId, FinalInfo: row.FinalInfo }] : [];
  });

  this.on("CREATE", eventReporting, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/EventsReportingSet ", req.data);
  });
});