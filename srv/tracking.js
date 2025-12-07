//srv/tracking.js
const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

const { UPSERT } = cds.ql;

// Robust extraction of $filter values from CAP query AST
function getFilterVal(req, prop) {
  const where = req?.query?.SELECT?.where;
  if (!Array.isArray(where)) return undefined;
  for (let i = 0; i < where.length; i++) {
    const t = where[i];
    // Common CAP pattern: {ref:['FoId']}, '=', {val:'...'}
    if (t && typeof t === 'object' && Array.isArray(t.ref) && t.ref[0] === prop) {
      if (where[i + 1] === '=' && where[i + 2] && typeof where[i + 2] === 'object' && 'val' in where[i + 2]) {
        return where[i + 2].val;
      }
      // Some templates use indexes (legacy)
      if (where[i + 2] && typeof where[i + 2] === 'object' && 'val' in where[i + 2]) {
        return where[i + 2].val;
      }
    }
  }
  return undefined;
}

function normalizeV2(data) {
  // OData V2 may return { d: { results: [...] } } or { d: {...} }
  const d = data?.d ?? data;
  if (Array.isArray(d?.results)) return d.results;
  if (d && typeof d === 'object') return [d];
  return [];
}

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

module.exports = cds.service.impl(async function () {
  // Open DB service once so the pool is ready before first request
  const db = await cds.connect.to('db');
  const run = (...args) => db.run(...args);
  const { trackingDetails, eventReporting, updatesPOD, shipmentItems } = this.entities;

  // DB tables (persistent)
  const {
    Shipments,
    ShipmentStops,
    StopEvents,
    Items
  } = cds.entities('sky.db');

  const safeRun = (stmt, context) => {
    // Fire-and-forget; do not block OData response on DB
    run(stmt).catch((err) => {
      console.warn(`DB persistence skipped (${context}):`, err.message || err);
    });
  };

  this.on("READ", trackingDetails, async (req) => {
    const foId = getFilterVal(req, 'FoId') ?? req.query.SELECT.where?.[2]?.val;
    if (!foId) return [];

    const data = await s4Get(`/SearchFOSet('${foId}')?$format=json`);
    const rows = normalizeV2(data);
    const row = rows[0];
    if (!row) return [];

    // Persist to HANA (UPSERT by key FoId)
    safeRun(
      UPSERT.into(Shipments).entries({
        FoId: row.FoId,
        FinalInfo: row.FinalInfo ?? null,
        DirectionsInfo: row.DirectionsInfo ?? null,
        StopInfo: row.StopInfo ?? null,
      }),
      'Shipments'
    );

    // Return to UI
    return [{
      FoId: row.FoId,
      FinalInfo: row.FinalInfo,
      DirectionsInfo: row.DirectionsInfo,
      StopInfo: row.StopInfo,
    }];
  });   

  this.on("READ", shipmentItems, async (req) => {
    // Read FoId & Location from $filter (CAP query AST)
    const foId = getFilterVal(req, 'FoId') ?? req.query.SELECT.where?.[2]?.val;
    const location = getFilterVal(req, 'Location') ?? req.query.SELECT.where?.[6]?.val;

    if (!foId || !location) return [];

    const path =
      `/ItemsSet?$filter=FoId eq '${foId}'` +
      ` and Location eq '${location}'&$format=json`;

    const v2 = await s4Get(path);
    const rows = normalizeV2(v2);

    // Map remote payload -> DB/service shape
    const items = rows.map((r) => ({
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

    // Persist to HANA (UPSERT by composite key FoId+Location+PackageId)
    if (items.length) {
      safeRun(UPSERT.into(Items).entries(items), 'Items');
    }

    return items;
  });

  this.on("CREATE", eventReporting, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/EventsReportingSet", req.data);
  });
  this.on("CREATE", updatesPOD, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/ProofOfDeliverySet", req.data);
  });
});
