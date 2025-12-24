const cds = require("@sap/cds");
const fetch = require("node-fetch"); // ✅ REQUIRED

module.exports = (srv) => {
  srv.on("exchangeToken", async (req) => {
    console.log("AUTH-EXCHANGE: exchangeToken called", req.data );
    const { code, verifier, redirect_uri } = req.data || {};
    if (!code || !verifier || !redirect_uri) {
      return req.reject(400, "Missing code/verifier/redirect_uri");
    }

    const xsuaa =
      process.env.VCAP_SERVICES &&
      JSON.parse(process.env.VCAP_SERVICES).xsuaa?.[0];

    const creds = xsuaa?.credentials;
    if (!creds?.url || !creds?.clientid || !creds?.clientsecret) {
      return req.reject(500, "XSUAA credentials missing (VCAP_SERVICES.xsuaa)");
    }

    const basic = Buffer
      .from(`${creds.clientid}:${creds.clientsecret}`)
      .toString("base64");

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
    if (!r.ok) return req.reject(r.status, text);

    return JSON.parse(text);
  });
};
