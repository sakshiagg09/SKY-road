// srv/tracking.js
const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const licenseOcr = require("./licenseOcrService"); // 👈 NEW
const express = require("express");

const { UPSERT } = cds.ql;
function getXsuaaCredentials() {
  // Try common CAP locations (varies by setup)
  return (
    cds.env.requires?.uaa?.credentials ||
    cds.env.requires?.xsuaa?.credentials ||
    cds.env.requires?.auth?.credentials ||
    null
  );
}

// --- register custom REST routes
cds.on("bootstrap", (app) => {
  // ensure JSON parsing for these custom endpoints
  app.use(express.json({ limit: "10mb" }));

  // ---------------------------------------------------------
  // POST /api/auth/exchange
  // Mobile sends { code, code_verifier, redirect_uri }
  // Server exchanges code -> token using XSUAA client secret
  // ---------------------------------------------------------
  app.post("/api/auth/exchange", async (req, res) => {
    try {
      console.log("Exchange request received", req,":", res);
      const { code, code_verifier, redirect_uri } = req.body || {};
      if (!code || !code_verifier || !redirect_uri) {
        return res.status(400).json({
          error: "missing_fields",
          error_description: "code, code_verifier, redirect_uri are required",
        });
      }

      const xsuaa = getXsuaaCredentials();
      if (!xsuaa?.url || !xsuaa?.clientid || !xsuaa?.clientsecret) {
        return res.status(500).json({
          error: "xsuaa_binding_missing",
          error_description:
            "XSUAA credentials not found in CAP env. Ensure service binding exists for sky-road-uaa.",
        });
      }

      const tokenUrl = `${xsuaa.url}/oauth/token`;

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: xsuaa.clientid,
        code_verifier,
      });

      const basic = Buffer.from(`${xsuaa.clientid}:${xsuaa.clientsecret}`).toString("base64");

      // Node 18+ has global fetch. If your runtime is older, we can add node-fetch later.
      const r = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(401).json(json);
      }

      return res.json(json);
    } catch (e) {
      console.error("auth/exchange failed:", e);
      return res.status(500).json({ error: "exchange_failed", error_description: e.message });
    }
  });

  // ---------------------------------------------------------
  // POST /api/tracking/location
  // Your mobile/native tracking pushes points here
  // ---------------------------------------------------------
  app.post("/api/tracking/location", async (req, res) => {
    try {
      // If approuter enforces XSUAA, requests will arrive with valid JWT.
      // (Later we’ll ensure approuter forwards token and CAP validates it)
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "unauthorized", error_description: "Missing Bearer token" });
      }

      const { FoId, DriverId, Latitude, Longitude, Accuracy, Timestamp } = req.body || {};
      if (!FoId || !DriverId) {
        return res.status(400).json({
          error: "bad_request",
          error_description: "FoId and DriverId are required",
        });
      }

      // For now: accept + acknowledge
      // (Later we can persist to HANA table or forward to S/4)
      return res.status(201).json({ ok: true });
    } catch (e) {
      console.error("tracking/location failed:", e);
      return res.status(500).json({ error: "tracking_failed", error_description: e.message });
    }
  });
});

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
      url, // <-- relative to destination URL
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
        Message: row.Message ?? null,
      }),
      "Shipments"
    );

    // Return to UI – also echo back the license we used
    return [
      {
        FoId: row.FoId,
        DriverLicense: row.DriverLicense || driverLicense,
        FinalInfo: row.FinalInfo,
        DirectionsInfo: row.DirectionsInfo,
        StopInfo: row.StopInfo,
        Message: row.Message || "",
      },
    ];
  });

  // ---------------------------------------------------------------------------
  // READ shipmentItems (unchanged)
  // ---------------------------------------------------------------------------
  this.on("READ", shipmentItems, async (req) => {
    // Read FoId & Location from $filter (CAP query AST)
    const foId = getFilterVal(req, "FoId") ?? req.query.SELECT.where?.[2]?.val;
    const location =
      getFilterVal(req, "Location") ?? req.query.SELECT.where?.[6]?.val;

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
      StopId: r.StopId || "",
    }));

    // Persist to HANA (UPSERT by composite key FoId+Location+PackageId)
    if (items.length) {
      safeRun(UPSERT.into(Items).entries(items), "Items");
    }

    return items;
  });

  // ---------------------------------------------------------------------------
  // CREATE handlers (unchanged)
  // ---------------------------------------------------------------------------
  this.on("CREATE", eventReporting, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/EventsReportingSet", req.data);
  });

  this.on("CREATE", updatesPOD, async (req) => {
    // IMPORTANT: use your real entity set name
    return await s4Post("/ProofOfDeliverySet", req.data);
  });

  this.on("CREATE", attachmentUpload, async (req) => {
    // Forward to S/4 AttachmentsSet
    return await s4Post("/AttachmentsSet", req.data);
  });

  this.on("CREATE", delayEvents, async (req) => {
    return await s4Post("/DelaySet", req.data);
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
});
