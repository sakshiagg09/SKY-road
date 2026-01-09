// srv/tracking.js
const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const licenseOcr = require("./licenseOcrService");
const application = process.env.EVENT_API_BASE

const { UPSERT } = cds.ql;

function getTarget() {
  return (process.env.EVENT_TARGET || "TM").toUpperCase(); // TM | SKY_PLUS
}

function skyPlusBase() {
  return (process.env.SKY_PLUS_BASE_URL || "https://skyplus-backend-hwf7gsdhathxd4h3.westeurope-01.azurewebsites.net").replace(/\/$/, "");
}

// Node 18+ has global fetch. If not, install node-fetch.
async function postSkyPlus(path, payload) {
  const url = `${skyPlusBase()}${path}`;
  console.log(`POST SKY+ to ${url} with payload:`, payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SKY+ POST failed (${res.status}): ${txt}`);
  }

  // expect JSON response same shape as TM (Event, Timestamp, StopId, FoId...)
  return await res.json().catch(() => ({}));
}

// Robust extraction of $filter values from CAP query AST
function getFilterVal(req, prop) {
  const where = req?.query?.SELECT?.where;
  if (!Array.isArray(where)) return undefined;
  for (let i = 0; i < where.length; i++) {
    const t = where[i];
    // Common CAP pattern: {ref:['FoId']}, '=', {val:'...'}
    if (t && typeof t === "object" && Array.isArray(t.ref) && t.ref[0] === prop) {
      if (
        where[i + 1] === "=" &&
        where[i + 2] &&
        typeof where[i + 2] === "object" &&
        "val" in where[i + 2]
      ) {
        return where[i + 2].val;
      }
      // Some templates use indexes (legacy)
      if (where[i + 2] && typeof where[i + 2] === "object" && "val" in where[i + 2]) {
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
  if (d && typeof d === "object") return [d];
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
      url: "/$metadata", // <-- relative to destination URL
      headers: { "x-csrf-token": "Fetch" },
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
      url,
      data: payload,
      headers: {
        "x-csrf-token": token,
        Cookie: cookie,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    },
    { fetchCsrfToken: false }
  );

  return res.data?.d ?? res.data;
}

module.exports = cds.service.impl(async function () {
  // ✅ Register token exchange action handler FIRST
  // Open DB service once so the pool is ready before first request
  const db = await cds.connect.to("db");
  const run = (...args) => db.run(...args);
  const {
    trackingDetails,
    eventReporting,
    updatesPOD,
    shipmentItems,
    attachmentUpload,
    delayEvents,
    ReturnItemsSet,
    UnloadingSet,
    AttachmentsSet
  } = this.entities;

  // DB tables (persistent)
  const { Shipments, ShipmentStops, StopEvents, Items } = cds.entities("sky.db");

  const safeRun = (stmt, context) => {
    // Fire-and-forget; do not block OData response on DB
    run(stmt).catch((err) => {
      console.warn(`DB persistence skipped (${context}):`, err.message || err);
    });
  };

  // ---------------------------------------------------------------------------
  // READ trackingDetails – now requires BOTH FoId + DriverLicense
  // ---------------------------------------------------------------------------
  this.on("READ", trackingDetails, async (req) => {
    const foId = getFilterVal(req, "FoId");
    const driverLicense = getFilterVal(req, "DriverLicense");

    if (!foId || !driverLicense) {
      console.warn("READ trackingDetails called without FoId or DriverLicense", {
        foId,
        driverLicense,
      });
      return [];
    }

    // 👇 Adjust this path if your S/4 service expects a different syntax,
    // e.g. /SearchFOSet(FoId='...',DriverLicense='...')
    const path =
      `/SearchFOSet(FoId='${foId}',LicenseNumber='${driverLicense}')?$format=json`;

    const data = await s4Get(path);
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
        Stops: row.Stops ?? null,
      }),
      "Shipments"
    );

    // Return to UI – also echo back the license we used
    return [
      {
        FoId: row.FoId,
        DriverLicense: row.DriverLicense || driverLicense,
        Message: row.Message,
        ReturnInfo: row.ReturnInfo,
        FinalInfo: row.FinalInfo,
        DirectionsInfo: row.DirectionsInfo,
        StopInfo: row.StopInfo,
        Stops: row.Stops,
      },
    ];
  });

  // ---------------------------------------------------------------------------
  // READ shipmentItems (unchanged)
  // ---------------------------------------------------------------------------
  this.on("READ", shipmentItems, async (req) => {
    const foId = getFilterVal(req, "FoId");
    const location = getFilterVal(req, "Location");
    const stopId = getFilterVal(req, "StopId")

    if (!foId || !location || !stopId) return [];

    const esc = (s) => String(s).replace(/'/g, "''");

    // ✅ READ BY KEY (not $filter)
    const path =
      `/ItemsSet(StopId='${esc(stopId)}',Location='${esc(location)}',FoId='${esc(foId)}')?$format=json`;


    const v2 = await s4Get(path);

    // ✅ SEGW returns SINGLE ENTITY → v2.d
    const d = v2;
    if (!d) return [];

    // For now just return raw structure (you can map later)
    return [{
      FoId: d.FoId,
      Location: d.Location,
      StopId: d.StopId,
      ReturnLoaded: d.ReturnLoaded,
      ReturnUnloaded: d.ReturnUnloaded,
      UnloadedItems: d.UnloadedItems,
      LoadedItems: d.LoadedItems
    }];
  });

  // ---------------------------------------------------------------------------
  // CREATE handlers (unchanged)
  // ---------------------------------------------------------------------------
  this.on("CREATE", eventReporting, async (req) => {
    if (getTarget() === "SKY_PLUS") {
      return await postSkyPlus("/api/event", req.data);
    }else{
      return await s4Post("/EventsReportingSet", req.data);
    }
     
  });

  this.on("CREATE", updatesPOD, async (req) => {
    if (getTarget() === "SKY_PLUS") {
      return await postSkyPlus("/api/pod", req.data); // change path if your sky+ uses different route
    }else{
       return await s4Post("/ProofOfDeliverySet", req.data);
      }
    
  });

  this.on("CREATE", attachmentUpload, async (req) => {
    return await s4Post("/AttachmentsSet", req.data);
  });

  this.on("CREATE", delayEvents, async (req) => {
    if (getTarget() === "SKY_PLUS") {
      return await postSkyPlus("/api/delay", req.data); // change path if needed
    }else{
      return await s4Post("/DelaySet", req.data);
    }
    
  });

  this.on("READ", delayEvents, async (req) => {
    const data = await s4Get("/DelaySet");
    const rows = normalizeV2(data);
    return rows.map((r) => ({
      FoId: r.FoId || "",
      StopId: r.StopId || "",
      ETA: r.ETA || "",
      RefEvent: r.RefEvent || "",
      Event: r.Event || "",
      EventCode: r.EventCode || "",
      EvtReasonCode: r.EvtReasonCode || "",
      Description: r.Description || "",
    }));
  });
  //Return Item Set Logic 
  this.on("READ", ReturnItemsSet, async (req) => {
    const foId = getFilterVal(req, "FoId");
    const location = getFilterVal(req, "Location");
    const stopId = getFilterVal(req, "StopId");

    if (!foId || !location || !stopId) return [];

    const esc = (s) => String(s).replace(/'/g, "''");

    // OData V2 key read
    const path =
      `/ReturnItemsSet(StopId='${esc(stopId)}',Location='${esc(location)}',FoId='${esc(foId)}')?$format=json`;

    const v2 = await s4Get(path);
    const d = v2; // s4Get already returns res.data?.d ?? res.data
    if (!d) return [];

    // Return as CAP entity row
    return [
      {
        FoId: d.FoId ?? foId,
        Location: d.Location ?? location,
        StopId: d.StopId ?? stopId,
        LoadedItems: d.LoadedItems ?? "[]", // keep as string (frontend parses JSON)
      },
    ];
  });

  //Return Item Set Logic 
  this.on("CREATE", ReturnItemsSet, async (req) => {
   // const foId = getFilterVal(req, "FoId");
   // const location = getFilterVal(req, "Location");
   // const stopId = getFilterVal(req, "StopId");

    if (!req.data) return [];

    const esc = (s) => String(s).replace(/'/g, "''");

    // OData V2 key read
    const path =
      `/ReturnItemsSet`;

    const d = await s4Post(path, req.data);
    // Return something useful to UI (even if backend returns minimal)
    return {
      FoId: d?.FoId,
      StopId: d?.StopId,
      Event: d?.Event ?? "Return",
      Timestamp: d?.Timestamp ?? d?.EventTime ?? null,
    };
  });

  //Unloading event logic
  this.on("CREATE", UnloadingSet, async (req) => {
    if (getTarget() === "SKY_PLUS") {
      console.log("Posting unloading to SKY PLUS:", req.data);
      return await postSkyPlus("/api/unloading", req.data); // change path if needed
    }
    else{
    const { FoId, StopId ,Latitude , Longitude } = req.data || {};
    if (!FoId || !StopId) return req.reject(400, "FoId and StopId are required");

    // Post to OData V2 backend
     const d = await s4Post("/UnloadingSet", { FoId, StopId ,Latitude , Longitude });
    // Return something useful to UI (even if backend returns minimal)
    return {
      FoId: d?.FoId ?? FoId,
      StopId: d?.StopId ?? StopId,
      Event: d?.Event ?? "UNLOADING",
      Latitude: d?.Latitude ?? Latitude ?? null,
      Longitude: d?.Longitude ?? Longitude ?? null,
      Timestamp: d?.Timestamp ?? d?.EventTime ?? null,
    };
  }
     
  });
  // Attachments 
  this.on("READ", AttachmentsSet, async (req) => {
    const foId = getFilterVal(req, "FoId");
    if (!foId) return []; // keep safe

    const esc = (s) => String(s).replace(/'/g, "''");

    // ✅ OData V2 filter read
    const path =
      `/AttachmentsSet?$filter=FoId eq '${esc(foId)}'&$format=json`;

    const v2 = await s4Get(path);
    const rows = normalizeV2(v2);

    return rows.map((r) => ({
      FoId: r.FoId || foId,
      FileName: r.FileName || "",
      Description: r.Description || "",
      CreatedBy: r.CreatedBy || "",
      FileType: r.FileType || "",
      MimeCode: r.MimeCode || "",
      PDFBase64: r.PDFBase64 || "", // ⚠️ big; UI should not request this in list ideally
    }));
  });


  // ---------------------------------------------------------------------------
  // OCR ACTION: extractLicenseNumber
  // ---------------------------------------------------------------------------
  this.on("extractLicenseNumber", async (req) => {
    try {
      const { imageBase64 } = req.data || {};
      if (!imageBase64) {
        return req.reject(400, "imageBase64 is required");
      }

      const buf = Buffer.from(imageBase64, "base64");
      const res = await licenseOcr.extractLicenseNumber(buf);

      return {
        licenseNumber: res.licenseNumber,
        confidence: res.confidence,
      };
    } catch (e) {
      console.error("extractLicenseNumber failed:", e);
      return req.reject(500, e.message || "OCR failed");
    }
  });


})

