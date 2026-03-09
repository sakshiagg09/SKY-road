const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "default-env.json");
const envJson = JSON.parse(fs.readFileSync(envPath, "utf8"));

process.env.VCAP_SERVICES = JSON.stringify(envJson.VCAP_SERVICES || {});
process.env.VCAP_APPLICATION = JSON.stringify(envJson.VCAP_APPLICATION || {
  application_name: "sky-road-approuter-local",
  application_uris: ["localhost:5001"]
});

const dests = JSON.stringify(envJson.destinations || []);
process.env.destinations = dests;   // <-- lower-case
process.env.DESTINATIONS = dests;   // <-- upper-case (some builds)

process.env.PORT = process.env.PORT || "5001";

console.log("PORT =", process.env.PORT);
console.log("destinations =", dests);

const approuterFactory = require("@sap/approuter");
approuterFactory().start();