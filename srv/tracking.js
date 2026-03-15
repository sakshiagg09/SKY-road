// srv/tracking.js
const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const licenseOcr = require("./licenseOcrService");
const { OpenAI, toFile } = require("openai");
const application = process.env.EVENT_API_BASE

const { UPSERT, SELECT } = cds.ql;

function getTarget() {
  return (process.env.EVENT_TARGET || "TM").toUpperCase(); // TM | SKY_PLUS
}

function GTTBase() {
  return (process.env.GTT_BASE_URL || "https://nav-gtt01-4vifgdob.gtt-flp-lbnplatform.cfapps.eu10.hana.ondemand.com/api/inbound/rest/v1/com.navgtt014vifgdob.gtt.app.gttft1.gttft1WriteService").replace(/\/$/, "");
}

function skyPlusBase() {
  return (process.env.SKY_PLUS_BASE_URL || "https://skyplus-backend-hwf7gsdhathxd4h3.westeurope-01.azurewebsites.net").replace(/\/$/, "");
}

async function postGTT(path, payload) {
  const url = `${GTTBase()}${path}`;
  console.log(`POST GTT to ${url} with payload:`, payload);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic c2Frc2hpLmFnZ2Fyd2FsQG5hdi1pdC5jb206SGVsbEAyU0FQMTIy`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SKY+ POST failed (${res.status}): ${txt}`);
  }

  // expect JSON response same shape as TM (Event, Timestamp, StopId, FoId...)
  return await res.json().catch(() => ({}));
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
  const { Shipments } = cds.entities("sky.db");

  // In-memory cache of Stops by FoId (populated from READ trackingDetails)
  // Note: per-app-instance; sufficient for single-instance dev/testing.
  const stopsCache = new Map();
  // In-memory cache of FinalInfo by FoId (populated from READ trackingDetails)
  const finalInfoCache = new Map();

  // ---------------------------------------------------------------------------
  // GTT helper: derive ordinal + locid from cached Stops and build
  // the required GTT payload for a given FO/Stop.
  // ---------------------------------------------------------------------------
  const buildGttEvent = async ({ FoId, StopId, Latitude, Longitude, Action, fixedPath }) => {
    if (!FoId || !StopId) throw new Error("FoId and StopId are required");

    // Read Stops from in-memory cache (populated during READ trackingDetails)
    const stops = stopsCache.get(FoId) || [];
    const finalInfo = finalInfoCache.get(FoId) || [];
    if (!Array.isArray(stops) || stops.length === 0) {
      console.warn(`Stops cache missing/empty for FoId ${FoId}. Ensure trackingDetails was read before posting events.`);
    }

    // Helpers for normalization
    const norm = (v) => String(v ?? "").trim();
    // GTT swagger requires coordinates to be a multiple of 1E-9 (<= 9 decimal places)
    const normNum = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.round(n * 1e9) / 1e9;
    };
    const locIdInStop = (s) => norm(s?.locid ?? s?.locId ?? "");
    // Stops array does not contain stopid; StopId comes from FinalInfo.stopid
    const stopIdInFinal = (f) => norm(f?.stopid ?? f?.stopId ?? f?.StopId ?? f?.STOPID ?? f?.stop_id ?? "");
    const seqIn = (x) => norm(x?.stopseqpos ?? x?.stopSeqPos ?? x?.StopSeqPos ?? x?.STOPSEQPOS ?? "").toUpperCase();

    const targetStopId = norm(StopId);

    // 1) Look up StopId in FinalInfo to get (seq, locid)
    const fin = (finalInfo || []).find((f) => stopIdInFinal(f) === targetStopId) || null;
    const finSeq = fin ? seqIn(fin) : "";
    const finLoc = norm(fin?.locid ?? fin?.locId ?? fin?.LocId ?? "");

    // 2) Determine the stop index/ordinal by matching Stops on (stopseqpos, locid)
    // Stops array uses stopseqpos + locid
    let idx = -1;
    if (finSeq && finLoc) {
      idx = (stops || []).findIndex((s) => seqIn(s) === finSeq && norm(s?.locid ?? s?.locId ?? "") === finLoc);
    }

    if (!fin) {
      console.warn(
        `FinalInfo match not found for FoId ${FoId} StopId '${targetStopId}'. ` +
        `Cannot derive (stopseqpos, locid) for GTT payload. Sample final stopids: ${((finalInfo || []).slice(0, 5).map(stopIdInFinal).filter(Boolean)).join(", ")}`
      );
    }

    if (idx < 0 && finSeq && finLoc) {
      console.warn(
        `Could not match Stops for FoId ${FoId} using (seq='${finSeq}', locid='${finLoc}'). ` +
        `locationAltKey will fall back to FinalInfo.locid.`
      );
    }

    // Ordinal is 1-based and 4-digit padded (0001, 0002, ...)
    const ordinal = String((idx >= 0 ? idx + 1 : 1)).padStart(4, "0");

    // Prefer Stops.locid when we could resolve idx; otherwise fall back to FinalInfo.locid
    const locid = idx >= 0 ? locIdInStop(stops?.[idx]) : finLoc;
    if (!locid) {
      console.warn(`locid missing for FoId ${FoId} (StopId ${targetStopId}, idx ${idx}). locationAltKey will be empty.`);
    }

    // Map Action -> GTT endpoint path (or use a fixedPath for POD/Unloading)
    const path = fixedPath
      ? fixedPath
      : (Action === "ARRV" ? "/Arrival" : Action === "DEPT" ? "/Departure" : `/${Action}`);

    // Timestamp + timezone
    const tsDate = new Date();
    const actualBusinessTimestamp = tsDate.toISOString();
    const actualBusinessTimeZone = (() => {
      try {
        const parts = new Intl.DateTimeFormat("en", { timeZoneName: "short" }).formatToParts(tsDate);
        return parts.find((p) => p.type === "timeZoneName")?.value || "UTC";
      } catch {
        return "UTC";
      }
    })();

    const payload = {
      altKey: `xri://sap.com/id:LBN#10020001074:S4ACLNT100:FT1_SHIPMENT:${FoId}`,
      eventMatchKey: `${FoId}${ordinal}`,
      actualBusinessTimeZone,
      actualBusinessTimestamp,
      locationAltKey: `xri://sap.com/id:LBN#10020001074:S4ACLNT100:Location:LogisticLocation:${locid}`,
      longitude: normNum(Longitude),
      latitude: normNum(Latitude),
    };

    return { path, payload, actualBusinessTimestamp };
  };

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

    // Cache Stops for later GTT event posting (avoid DB dependency)
    try {
      const rawStops = row.Stops ?? null;
      const parsedStops = typeof rawStops === "string" ? JSON.parse(rawStops) : Array.isArray(rawStops) ? rawStops : [];
      stopsCache.set(row.FoId, parsedStops);
    } catch (e) {
      console.warn("Failed to cache Stops from trackingDetails:", e.message || e);
      stopsCache.set(row.FoId, []);
    }

    // Cache FinalInfo for later GTT event posting (StopId -> locid/stopseqpos mapping)
    try {
      const rawFinal = row.FinalInfo ?? null;
      const parsedFinal = typeof rawFinal === "string" ? JSON.parse(rawFinal) : Array.isArray(rawFinal) ? rawFinal : [];
      finalInfoCache.set(row.FoId, parsedFinal);
    } catch (e) {
      console.warn("Failed to cache FinalInfo from trackingDetails:", e.message || e);
      finalInfoCache.set(row.FoId, []);
    }

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
    console.log("posting to GTT:", getTarget(), req.data);
    if (getTarget() === "SKY_PLUS") {
      return await postSkyPlus("/api/event", req.data);
    }
    else if (getTarget() === "GTT") {
      const { FoId, Action, StopId, Latitude, Longitude } = req.data || {};
      if (!FoId || !StopId || !Action) return req.reject(400, "FoId, StopId and Action are required");

      const { path, payload, actualBusinessTimestamp } = await buildGttEvent({
        FoId,
        StopId,
        Latitude,
        Longitude,
        Action,
      });

      await postGTT(path, payload);

      return {
        FoId,
        StopId,
        Event: Action === "ARRV" ? "ARRIVAL" : Action === "DEPT" ? "DEPARTURE" : Action,
        Latitude: Latitude ?? null,
        Longitude: Longitude ?? null,
        Timestamp: actualBusinessTimestamp,
      };
    }
    else {
      return await s4Post("/EventsReportingSet", req.data);
    }
  });

  this.on("CREATE", updatesPOD, async (req) => {
    if (getTarget() === "SKY_PLUS") {
      return await postSkyPlus("/api/pod", req.data); // change path if your sky+ uses different route
    }
    else if (getTarget() === "GTT") {
      const { FoId, StopId, Latitude, Longitude } = req.data || {};
      if (!FoId || !StopId) return req.reject(400, "FoId and StopId are required");

      const { path, payload, actualBusinessTimestamp } = await buildGttEvent({
        FoId,
        StopId,
        Latitude,
        Longitude,
        fixedPath: "/POD",
      });

      await postGTT(path, payload);

      return {
        FoId,
        StopId,
        Event: "POD",
        Latitude: Latitude ?? null,
        Longitude: Longitude ?? null,
        Timestamp: actualBusinessTimestamp,
      };
    }
    else {
      return await s4Post("/ProofOfDeliverySet", req.data);
    }
  });

  this.on("CREATE", attachmentUpload, async (req) => {
    return await s4Post("/AttachmentsSet", req.data);
  });

  this.on("CREATE", delayEvents, async (req) => {
    console.log("[delayEvents] POST payload:", JSON.stringify(req.data, null, 2));
    if (getTarget() === "SKY_PLUS") {
      return await postSkyPlus("/api/delay", req.data); // change path if needed
    }
    else if (getTarget() === "GTT") {
      const {
        FoId,
        StopId,
        Latitude,
        Longitude,
        ETA,
        RefEvent,
        Event,
        EventCode,
        EvtReasonCode,
        Description,
      } = req.data || {};

      if (!FoId || !StopId) return req.reject(400, "FoId and StopId are required");

      // Base GTT payload (altKey/eventMatchKey/locationAltKey/coords/timestamp)
      const { path, payload, actualBusinessTimestamp } = await buildGttEvent({
        FoId,
        StopId,
        Latitude,
        Longitude,
        fixedPath: "/Delay",
      });

      await postGTT(path, payload);

      return {
        FoId,
        StopId,
        ETA: ETA ?? null,
        RefEvent: RefEvent ?? null,
        Event: Event ?? null,
        EventCode: EventCode ?? null,
        EvtReasonCode: EvtReasonCode ?? null,
        Description: Description ?? null,
        Latitude: Latitude ?? null,
        Longitude: Longitude ?? null,
        Timestamp: actualBusinessTimestamp,
      };
    }
    else {
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
    else if (getTarget() === "GTT") {
      const { FoId, StopId, Latitude, Longitude } = req.data || {};
      if (!FoId || !StopId) return req.reject(400, "FoId and StopId are required");

      const { path, payload, actualBusinessTimestamp } = await buildGttEvent({
        FoId,
        StopId,
        Latitude,
        Longitude,
        fixedPath: "/UnloadingEnd",
      });

      await postGTT(path, payload);

      return {
        FoId,
        StopId,
        Event: "UNLOADING",
        Latitude: Latitude ?? null,
        Longitude: Longitude ?? null,
        Timestamp: actualBusinessTimestamp,
      };
    }
    else {
      const { FoId, StopId, Latitude, Longitude, Timestamp } = req.data || {};
      if (!FoId || !StopId) return req.reject(400, "FoId and StopId are required");

      // Post to OData V2 backend
      const d = await s4Post("/UnloadingSet", { FoId, StopId, Latitude, Longitude, Timestamp });
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
      `/AttachmentsSet?$filter=FoId eq '${esc(foId)}' and CreatedBy eq 'BTP_APP01'&$format=json`;
    console.log("Fetching attachments from S/4 with path:", path);
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
  // VOICE ACTION: interpretVoice (pure rule-based, no external AI)
  // ---------------------------------------------------------------------------
  this.on("interpretVoice", async (req) => {
    const { transcript = "" } = req.data || {};

    // Try GPT-4o-mini first; fall back to regex if offline / API unavailable
    if (process.env.OPENAI_API_KEY) {
      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                `You are a logistics assistant. Extract structured delay information from a truck driver's voice message.
Return ONLY a JSON object with exactly these fields:
- eventType: "Delay" | "Accident" | "Customs Hold" | "Other"
- delayMinutes: integer minutes of delay (0 if unknown or not mentioned)
- priority: "Low" (under 30 min) | "Normal" (30–60 min) | "High" (over 60 min, or accident)
- reasonHint: pipe-separated keywords describing the cause, e.g. "traffic|congestion|road". Empty string if unknown.
- notes: the original message trimmed to 200 characters
- refEvent: "ARR" if eventType is Delay or Accident, otherwise ""
Rules:
- If the driver says they will arrive at a specific time and gives their scheduled time, calculate delayMinutes from the difference.
- "an hour and a half" = 90 minutes. "half an hour" = 30 minutes.
- reasonCode must always be an empty string "".`,
            },
            { role: "user", content: String(transcript).trim() },
          ],
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        // Sanitise — ensure all expected fields are present with correct types
        return {
          eventType:    ["Delay","Accident","Customs Hold","Other"].includes(parsed.eventType) ? parsed.eventType : "Other",
          delayMinutes: Number.isInteger(parsed.delayMinutes) ? Math.max(0, parsed.delayMinutes) : 0,
          priority:     ["Low","Normal","High"].includes(parsed.priority) ? parsed.priority : "Low",
          reasonHint:   typeof parsed.reasonHint === "string" ? parsed.reasonHint : "",
          reasonCode:   "",
          notes:        String(parsed.notes || transcript).trim().slice(0, 200),
          refEvent:     typeof parsed.refEvent === "string" ? parsed.refEvent : "",
        };
      } catch (e) {
        console.warn("[interpretVoice] GPT failed, falling back to regex:", e.message || e);
      }
    }

    // ---------------------------------------------------------------------------
    // Regex fallback — used when offline or OPENAI_API_KEY is not set
    // ---------------------------------------------------------------------------
    const t = String(transcript).toLowerCase().trim();

    let eventType = "Other";
    if (/delay|late|behind|stuck|traffic|slow|held up|running late/.test(t)) {
      eventType = "Delay";
    } else if (/accident|crash|breakdown|broke down|collision/.test(t)) {
      eventType = "Accident";
    } else if (/customs|border|clearance|inspection/.test(t)) {
      eventType = "Customs Hold";
    }

    const wordNums = {
      "zero":0,"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,
      "eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"thirteen":13,
      "fourteen":14,"fifteen":15,"sixteen":16,"seventeen":17,"eighteen":18,
      "nineteen":19,"twenty":20,"thirty":30,"forty":40,"fifty":50,"sixty":60,
    };
    const tn = t.replace(/\b(twenty|thirty|forty|fifty)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, tens, ones) =>
      String((wordNums[tens] || 0) + (wordNums[ones] || 0))
    ).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b/g,
      (w) => String(wordNums[w] ?? w)
    );

    let delayMinutes = 0;
    const anHourMatch   = /\ban?\s+hours?/.test(tn);
    const halfHourMatch = /half\s+(?:an?\s+)?hours?/.test(tn);
    const hoursMatch    = tn.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
    const minsMatch     = tn.match(/(\d+)\s*(?:minutes?|mins?)/);

    if (halfHourMatch) {
      delayMinutes = 30;
    } else if (hoursMatch) {
      const h = parseFloat(hoursMatch[1]);
      const m = minsMatch ? parseInt(minsMatch[1], 10) : 0;
      delayMinutes = Math.round(h * 60) + m;
    } else if (anHourMatch) {
      delayMinutes = 60 + (minsMatch ? parseInt(minsMatch[1], 10) : 0);
    } else if (minsMatch) {
      delayMinutes = parseInt(minsMatch[1], 10);
    }
    if (delayMinutes === 0) {
      const bareMatch = tn.match(/(\d+)\s*(?:late|delay|behind)/);
      if (bareMatch) delayMinutes = parseInt(bareMatch[1], 10);
    }

    let priority = "Low";
    if (delayMinutes > 60)       priority = "High";
    else if (delayMinutes >= 30) priority = "Normal";

    let reasonHint = "";
    if (/traffic|congestion|jam|gridlock|bumper|motorway|highway|freeway/.test(t))
      reasonHint = "traffic|congestion|road";
    else if (/flat.?tyre|flat.?tire|puncture|tyre|tire/.test(t))
      reasonHint = "tyre|tire|breakdown|mechanical";
    else if (/breakdown|broke.?down|mechanical|engine|overheated|vehicle/.test(t))
      reasonHint = "breakdown|mechanical|vehicle";
    else if (/accident|crash|collision|pile.?up/.test(t))
      reasonHint = "accident|crash|collision";
    else if (/customs|border|clearance|inspection|port|immigration/.test(t))
      reasonHint = "customs|border|clearance";
    else if (/weather|storm|snow|rain|flood|fog|ice|icy|slippery|hail/.test(t))
      reasonHint = "weather|storm|flood";
    else if (/road.?work|construction|closure|detour|diversion|blocked/.test(t))
      reasonHint = "road|construction|closure";
    else if (/strike|protest|demonstration/.test(t))
      reasonHint = "strike|labour";
    else if (/police|checkpoint/.test(t))
      reasonHint = "police|checkpoint";
    else if (eventType === "Delay")        reasonHint = "delay|late";
    else if (eventType === "Accident")     reasonHint = "accident";
    else if (eventType === "Customs Hold") reasonHint = "customs";

    return {
      eventType,
      delayMinutes,
      priority,
      reasonHint,
      reasonCode: "",
      notes: String(transcript).trim().slice(0, 200),
      refEvent: eventType !== "Other" ? "ARR" : "",
    };
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

  // ---------------------------------------------------------------------------
  // WHISPER STT helper — shared by transcribeAudio + detectWakeWord
  // ---------------------------------------------------------------------------
  async function whisperTranscribe(audioBase64) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const buffer = Buffer.from(audioBase64, "base64");
    const file = await toFile(buffer, "audio.wav", { type: "audio/wav" });
    const res = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
    });
    return (res.text || "").trim();
  }

  // ---------------------------------------------------------------------------
  // transcribeAudio — base64 WAV → transcript string
  // ---------------------------------------------------------------------------
  this.on("transcribeAudio", async (req) => {
    const { audioBase64 } = req.data || {};
    if (!audioBase64) return req.reject(400, "audioBase64 is required");
    try {
      const transcript = await whisperTranscribe(audioBase64);
      return { transcript };
    } catch (e) {
      console.error("transcribeAudio failed:", e);
      return req.reject(500, e.message || "Transcription failed");
    }
  });

  // ---------------------------------------------------------------------------
  // detectWakeWord — transcribe a 2-second chunk and check for "Hey Sky"
  // ---------------------------------------------------------------------------
  this.on("detectWakeWord", async (req) => {
    const { audioBase64 } = req.data || {};
    if (!audioBase64) return req.reject(400, "audioBase64 is required");
    try {
      const fullTranscript = await whisperTranscribe(audioBase64);

      // Filter known Whisper silence hallucinations before spending a GPT call
      const HALLUCINATIONS = /^(thank you( for watching)?\.?|thanks( for watching)?\.?|please subscribe\.?|like and subscribe\.?|\.+|,+|\s*)$/i;
      if (!fullTranscript || HALLUCINATIONS.test(fullTranscript.trim())) {
        console.log(`[detectWakeWord] hallucination filtered: "${fullTranscript}"`);
        return { detected: false, transcript: "", fullTranscript };
      }

      // Use GPT to robustly detect wake word — handles any mishearing or accent
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a wake word detector. The wake word is "Hey Sky".
Determine if the transcript contains an attempt to say "Hey Sky".
Be forgiving: accept "Hi Sky", "Hay Sky", "A Sky", "Hey Ski", "Hey Skai", "Hi, Sky", "Hey, Sky", etc.
Return JSON with exactly: { "detected": true or false, "remainder": "any text spoken after the wake word, or empty string" }`,
          },
          { role: "user", content: fullTranscript },
        ],
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      const detected = Boolean(parsed.detected);
      const transcript = detected ? String(parsed.remainder || "").trim() : "";

      console.log(`[detectWakeWord] whisper="${fullTranscript}" detected=${detected} remainder="${transcript}"`);
      return { detected, transcript, fullTranscript };
    } catch (e) {
      console.error("detectWakeWord failed:", e);
      return req.reject(500, e.message || "Wake word detection failed");
    }
  });


})

