const cds = require("@sap/cds");

cds.on("bootstrap", (app) => {
  const bodyParser = require("body-parser");
  app.use(bodyParser.json({ limit: "15mb" }));
  app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

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

    const basic = Buffer.from(
      `${creds.clientid}:${creds.clientsecret}`
    ).toString("base64");

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

    // XSUAA may rotate refresh_token; return exactly what XSUAA returns
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    console.error("AUTH-REFRESH (express) failed:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});
 app.post("/api/tracking/location", async (req, res) => {
    try {
      const p = req.body || {};

      // Minimal validation (don’t block your app)
      if (!p.FoId || !p.DriverId || p.Latitude == null || p.Longitude == null) {
        return res.status(400).json({ error: "FoId, DriverId, Latitude, Longitude are required" });
      }

      // Persist to DB
      const db = await cds.connect.to("db");
      await db.run(
        INSERT.into("sky.db.DriverLocations").entries({
          ID: cds.utils.uuid(),
          FoId: String(p.FoId),
          DriverId: String(p.DriverId),
          Latitude: Number(p.Latitude),
          Longitude: Number(p.Longitude),
          Accuracy: p.Accuracy == null ? null : Number(p.Accuracy),
          Timestamp: p.Timestamp == null ? Date.now() : Number(p.Timestamp),
          Speed: p.Speed == null ? null : Number(p.Speed),
          Bearing: p.Bearing == null ? null : Number(p.Bearing),
          createdAt: new Date(),
        })
      );

      // Respond quickly
      return res.status(204).end();
    } catch (e) {
      console.error("TRACKING: /api/tracking/location failed:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });
});

module.exports = cds.server;
