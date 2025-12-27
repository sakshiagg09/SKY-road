const cds = require("@sap/cds");
const fetch = require("node-fetch");

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
});

module.exports = cds.server;
