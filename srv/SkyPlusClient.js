const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

const SKYPLUS_BASE_URL = "http://localhost:5000"; // <-- set to "" to disable

async function postSkyPlusEvent({ FoId, StopId, Action_Name,EventLat, EventLong }) {
  if (!SKYPLUS_BASE_URL) return null;

  try {
    const res = await executeHttpRequest(
      { url: SKYPLUS_BASE_URL },
      {
        method: "POST",
        url: "/api/events",
        data: { FoId, StopId, Action_Name, EventLat, EventLong },
        headers: { "Content-Type": "application/json" },
      }
    );
    return res.data;
  } catch (e) {
    // IMPORTANT: never break TM flow
    console.warn("SKY+ mirror failed:", e.message || e);
    return null;
  }
}

module.exports = { postSkyPlusEvent };
