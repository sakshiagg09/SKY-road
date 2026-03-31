const cds = require("@sap/cds");
const { INSERT } = cds.ql;
//this is for posting location to SKY+
function skyPlusBase() {
  return (process.env.SKY_PLUS_BASE_URL || "https://skyplus-backend-hwf7gsdhathxd4h3.westeurope-01.azurewebsites.net")
    .replace(/\/$/, "");
}

function getTrackingTarget() {
  return (process.env.TRACKING_TARGET || "SKY").toUpperCase(); // SKY | SKY_PLUS
}

async function postSkyPlusTracking(payload) {
  const url = `${skyPlusBase()}/api/tracking/location`;
   console.log("SKY → SKY+ FORWARD URL:", url);
  console.log("SKY → SKY+ FORWARD PAYLOAD:", payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // ✅ keep minimal, no auth
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
      console.log("SKY → SKY+ FORWARD RES:", res.status, txt);
    throw new Error(`SKY+ tracking POST failed (${res.status}): ${txt}`);
  }
  return true;
}

cds.on("bootstrap", (app) => {
  const bodyParser = require("body-parser");
  app.use(bodyParser.json({ limit: "15mb" }));
  app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

  // ----------------------------
  // AUTH: Exchange
  // ----------------------------
  app.post("/auth/exchange", async (req, res) => {
    try {
      console.log("AUTH-EXCHANGE (express): called");

      const { code, verifier, redirect_uri } = req.body || {};
      if (!code || !verifier || !redirect_uri) {
        return res.status(400).json({ error: "Missing code/verifier/redirect_uri" });
      }

      const xsuaa = process.env.VCAP_SERVICES && JSON.parse(process.env.VCAP_SERVICES).xsuaa?.[0];
      const creds = xsuaa?.credentials;
      if (!creds?.url || !creds?.clientid || !creds?.clientsecret) {
        return res.status(500).json({ error: "XSUAA credentials missing" });
      }

      const basic = Buffer.from(`${creds.clientid}:${creds.clientsecret}`).toString("base64");

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        code_verifier: verifier,
      });

      const r = await fetch(`${creds.url}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });

      const text = await r.text();
      if (!r.ok) return res.status(r.status).send(text);

      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      console.error("AUTH-EXCHANGE (express) failed:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // ----------------------------
  // AUTH: Refresh
  // ----------------------------
  app.post("/auth/refresh", async (req, res) => {
    try {
      console.log("AUTH-REFRESH (express): called");

      const { refresh_token } = req.body || {};
      if (!refresh_token) {
        return res.status(400).json({ error: "Missing refresh_token" });
      }

      const xsuaa =
        process.env.VCAP_SERVICES &&
        JSON.parse(process.env.VCAP_SERVICES).xsuaa?.[0];
      const creds = xsuaa?.credentials;

      if (!creds?.url || !creds?.clientid || !creds?.clientsecret) {
        return res.status(500).json({ error: "XSUAA credentials missing" });
      }

      const basic = Buffer.from(`${creds.clientid}:${creds.clientsecret}`).toString("base64");

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
      });

      const r = await fetch(`${creds.url}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });

      const text = await r.text();
      if (!r.ok) return res.status(r.status).send(text);

      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      console.error("AUTH-REFRESH (express) failed:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // ----------------------------
  // TRACKING: Store driver location
  // ----------------------------
  app.post("/api/tracking/location", async (req, res) => {
  try {
    const p = req.body || {};

    if (!p.FoId || !p.DriverId || p.Latitude == null || p.Longitude == null) {
      return res.status(400).json({
        error: "FoId, DriverId, Latitude, Longitude are required",
      });
    }

    const db = await cds.connect.to("db");

    const ts = Number(p.Timestamp);
    const safeTs = Number.isFinite(ts) ? ts : Date.now();

    const row = {
      ID: cds.utils.uuid(),
      FoId: String(p.FoId),
      DriverId: String(p.DriverId),
      Latitude: Number(p.Latitude),
      Longitude: Number(p.Longitude),
      Accuracy: p.Accuracy == null ? null : Number(p.Accuracy),
      Timestamp: safeTs,
      Speed: p.Speed == null ? null : Number(p.Speed),   // km/h
      Bearing: p.Bearing == null ? null : Number(p.Bearing),
      createdAt: new Date(),
    };

    
    await db.run(
      INSERT.into("sky.db.DriverLocations").entries(row)
    );
    if (getTrackingTarget() === "SKY_PLUS") {
      postSkyPlusTracking({
        FoId: row.FoId,
        DriverId: row.DriverId,
        Latitude: row.Latitude,
        Longitude: row.Longitude,
        Accuracy: row.Accuracy,
        Timestamp: row.Timestamp,
        Speed: row.Speed,
        Bearing: row.Bearing,
      }).catch((e) => {
        console.warn(
          "SKY → SKY+ tracking forward failed:",
          e?.message || e
        );
      });
    }

    return res.status(204).end();

  } catch (e) {
    console.error("TRACKING: /api/tracking/location failed:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

  // ----------------------------
  // ROUTES: ETA (Google Routes API)
  // ----------------------------
  app.post("/api/routes/eta", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GOOGLE_ROUTES_API_KEY missing" });

      const { origin, destination, travelMode, routingPreference } = req.body || {};

      const oLat = Number(origin?.lat);
      const oLng = Number(origin?.lng);
      const dLat = Number(destination?.lat);
      const dLng = Number(destination?.lng);

      if (!Number.isFinite(oLat) || !Number.isFinite(oLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
        return res.status(400).json({ error: "origin/destination lat/lng required" });
      }

      const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

      const payload = {
        origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
        destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
        travelMode: travelMode || "DRIVE",
        routingPreference: routingPreference || "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "METRIC",
      };

      const fieldMask = "routes.distanceMeters,routes.duration";

      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
           "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(payload),
      });

      const text = await r.text();
      console.log("GOOGLE STATUS:", r.status);
console.log("GOOGLE RAW TEXT:", text);
      if (!r.ok) {
        return res.status(r.status).json({
          error: "Routes API error",
          details: text,
        });
      }

      const json = JSON.parse(text);
      const route = Array.isArray(json.routes) ? json.routes[0] : null;

      const dist = Number(route?.distanceMeters);
      const durStr = route?.duration; // like "1234s"

      let durationSeconds = null;
      if (typeof durStr === "string" && durStr.endsWith("s")) {
        const n = Number(durStr.slice(0, -1));
        durationSeconds = Number.isFinite(n) ? n : null;
      }

      return res.json({
        distanceMeters: Number.isFinite(dist) ? dist : null,
        durationSeconds,
      });
    } catch (e) {
      console.error("ROUTES: /api/routes/eta failed:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // ----------------------------
  // ROUTES: Multi-stop ETA (Google Routes API with waypoints)
  // ----------------------------
  app.post("/api/routes/multi-eta", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GOOGLE_ROUTES_API_KEY missing" });

      const { origin, stops, baseMs: baseMsIn } = req.body || {};
      if (!Array.isArray(stops) || stops.length < 1)
        return res.status(400).json({ error: "stops array required" });

      const oLat = Number(origin?.lat);
      const oLng = Number(origin?.lng);
      if (!Number.isFinite(oLat) || !Number.isFinite(oLng))
        return res.status(400).json({ error: "origin lat/lng required" });

      const baseMs = Number.isFinite(Number(baseMsIn)) ? Number(baseMsIn) : Date.now();

      // Filter to stops with valid coords, preserve original index/id
      const validStops = stops.filter((s) => {
        const lat = Number(s?.lat);
        const lng = Number(s?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
      });

      if (validStops.length < 1)
        return res.status(400).json({ error: "no valid stop coordinates" });

      const destination = validStops[validStops.length - 1];
      const intermediates = validStops.slice(0, -1);

      const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
      const payload = {
        origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
        destination: {
          location: {
            latLng: { latitude: Number(destination.lat), longitude: Number(destination.lng) },
          },
        },
        intermediates: intermediates.map((s) => ({
          location: { latLng: { latitude: Number(s.lat), longitude: Number(s.lng) } },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
      };

      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.legs.duration,routes.legs.distanceMeters",
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: "Routes API error", details: text });
      }

      const json = await r.json();
      const legs = json.routes?.[0]?.legs ?? [];

      // Cumulative ETAs: leg[i] = travel time from prev point to validStops[i]
      let cumulativeMs = baseMs;
      const etas = validStops.map((s, i) => {
        const leg = legs[i];
        const durStr = leg?.duration;
        let legSeconds = 0;
        if (typeof durStr === "string" && durStr.endsWith("s")) {
          legSeconds = Number(durStr.slice(0, -1)) || 0;
        }
        cumulativeMs += legSeconds * 1000;
        const totalSeconds = Math.round((cumulativeMs - baseMs) / 1000);
        return { id: s.id, etaMs: cumulativeMs, durationSeconds: totalSeconds };
      });

      return res.json({ etas });
    } catch (e) {
      console.error("ROUTES: /api/routes/multi-eta failed:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });
});

module.exports = cds.server;
