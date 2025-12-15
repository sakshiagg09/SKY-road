const cds = require("@sap/cds");

cds.on("bootstrap", (app) => {
  const bodyParser = require("body-parser");

  // Increase limits for json/raw/text upload (OCR images)
  app.use(bodyParser.json({ limit: "15mb" }));
  app.use(bodyParser.raw({ limit: "15mb" }));
  app.use(bodyParser.text({ limit: "15mb" }));
  app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));
});

module.exports = cds.server;
