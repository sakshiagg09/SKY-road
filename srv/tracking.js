//srv/tracking.js
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
  const { trackingDetails, eventReporting, updatesPOD,shipmentItems } = this.entities;

  this.on("READ", trackingDetails, async (req) => {
    const foId = req.query.SELECT.where?.[2]?.val;
    const data = await s4Get(`/SearchFOSet('${foId}')?$format=json`);
    const row = data?.results?.[0] ?? data;
    return row ? [{ FoId: row.FoId, FinalInfo: row.FinalInfo }] : [];
  });   

  this.on("READ", shipmentItems, async (req) => {
    // Support both key read and $filter read
     const foId = req.query.SELECT.where?.[2]?.val;
     const location = req.query.SELECT.where?.[6]?.val;

    // Build SEGW-style path:
    // /sap/opu/odata/SAP/ZSKY_SRV/ItemsSet(Location='1000000000',FoId='6300003009')?$format=json
    const path =
      `/ItemsSet?$filter=FoId eq '${foId}'` +
      ` and Location eq '${location}'&$format=json`;
    const d = await s4Get(path);

    // OData v2: { results: [...] } or single entity
    const rows = Array.isArray(d?.results) ? d.results : d ? [d] : [];

    // Map to CAP entity Items (fields we defined in schema)
    return rows.map((r) => ({
      FoId: r.FoId,
      Location: r.Location,
      PackageId: r.PackageId,
      ItemDescr: r.ItemDescr,
      ItemCat: r.ItemCat,
      Type: r.Type,
      Quantity: r.Quantity,
      QuantityUom: r.QuantityUom,
      GrossWeight: r.GrossWeight,
      GrossWeightUom: r.GrossWeightUom,
    }));
  });

  this.on("CREATE", eventReporting, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/EventsReportingSet ", req.data);
  });
  this.on("CREATE", updatesPOD, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/ProofOfDeliverySet ", req.data);
  });
});