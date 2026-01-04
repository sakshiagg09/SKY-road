const cds = require("@sap/cds");
const { INSERT } = cds.ql;

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
        return res.status(400).json({ error: "FoId, DriverId, Latitude, Longitude are required" });
      }

      const db = await cds.connect.to("db");

      const ts = Number(p.Timestamp);
      const safeTs = Number.isFinite(ts) ? ts : Date.now();

      await db.run(
        INSERT.into("sky.db.DriverLocations").entries({
          ID: cds.utils.uuid(),
          FoId: String(p.FoId),
          DriverId: String(p.DriverId),
          Latitude: Number(p.Latitude),
          Longitude: Number(p.Longitude),
          Accuracy: p.Accuracy == null ? null : Number(p.Accuracy),
          Timestamp: safeTs,
          Speed: p.Speed == null ? null : Number(p.Speed),
          Bearing: p.Bearing == null ? null : Number(p.Bearing),
          createdAt: new Date(),
        })
      );

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
});

module.exports = cds.server;
