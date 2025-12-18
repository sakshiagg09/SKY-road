const cds = require("@sap/cds");

cds.on("bootstrap", (app) => {
  const bodyParser = require("body-parser");

  // Increase limits for json/raw/text upload (OCR images)
  app.use(bodyParser.json({ limit: "15mb" }));
  app.use(bodyParser.raw({ limit: "15mb" }));
  app.use(bodyParser.text({ limit: "15mb" }));
  app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

  // ✅ CORS for Capacitor APK / cross-origin calls
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-csrf-token");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });
});

module.exports = cds.server;
