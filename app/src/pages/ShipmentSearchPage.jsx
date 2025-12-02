import React, { useEffect, useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";

import logo from "../assets/logo.png.png";
import BarcodeScanner from "../components/BarcodeScanner";

/**
 * Props:
 *  - setSelectedShipment(fn)
 *  - setActiveTab(fn)
 */
export default function ShipmentSearchPage({ setSelectedShipment, setActiveTab }) {
  const [trackingInput, setTrackingInput] = useState("");
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  // --- Helpers -------------------------------------------------------

  // safe key used to persist icons (do NOT put React elements in storage)
  const ICON_KEY_DEFAULT = "truck";

  const renderIconForKey = (key) => {
    // expand here if you add more icon kinds later
    switch (key) {
      case "truck":
      default:
        return <LocalShippingOutlinedIcon fontSize="small" />;
    }
  };

  // load recent from localStorage on mount (and sanitize)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sr_recent_shipments");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map((r) => {
            return {
              id: r.id,
              status: r.status,
              date: r.date,
              time: r.time,
              color: r.color || "#1976D2",
              // NOTE: we do NOT restore r.raw here (we intentionally avoid storing raw API object)
              raw: null,
              iconKey: typeof r.iconKey === "string" ? r.iconKey : ICON_KEY_DEFAULT,
            };
          });
          setRecent(sanitized);
        }
      }
    } catch (e) {
      console.warn("Failed to load recent from localStorage", e);
      setRecent([]);
    }
  }, []);

  // persist helper — stores a compact, serializable shape (no raw API object)
  const persistRecent = (list) => {
    try {
      const serializable = list.map((r) => ({
        id: r.id,
        status: r.status,
        date: r.date,
        time: r.time,
        color: r.color,
        iconKey: r.iconKey || ICON_KEY_DEFAULT,
      }));
      localStorage.setItem("sr_recent_shipments", JSON.stringify(serializable));
      console.debug("Persisted recent:", serializable);
    } catch (e) {
      console.warn("Failed to persist recent", e);
    }
  };

  // Helper: parse FinalInfo -> array of stops
  const parseFinalInfo = (finalInfoValue) => {
    if (!finalInfoValue) return [];
    try {
      if (typeof finalInfoValue === "string") {
        return JSON.parse(finalInfoValue);
      } else if (Array.isArray(finalInfoValue)) {
        return finalInfoValue;
      } else {
        return [];
      }
    } catch (e) {
      console.error("Failed to parse FinalInfo:", e, finalInfoValue);
      return [];
    }
  };

  // fetch handler: reads OData response and returns data object
  async function loadTrackingDetails(trackingId) {
    const res = await fetch(`odata/v4/GTT/trackingDetails?$filter=FoId eq '${trackingId}'`);
    if (!res.ok) {
      throw new Error("Failed to load tracking details");
    }
    const data = await res.json();
    return data;
  }

  // update recent list (dedupe & unshift) — writes to localStorage synchronously so navigation/unmounts won't stop it
  const addToRecent = (entry) => {
    try {
      // read current from storage (robust to other tabs / previous failures)
      const raw = localStorage.getItem("sr_recent_shipments");
      let cur = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) cur = parsed;
        } catch (e) {
          console.warn("Failed to parse existing sr_recent_shipments", e);
          cur = [];
        }
      }

      // ensure we use compact shape for storage
      const compactEntry = {
        id: entry.id,
        status: entry.status,
        date: entry.date,
        time: entry.time,
        color: entry.color || "#1976D2",
        iconKey: entry.iconKey || ICON_KEY_DEFAULT,
      };

      // dedupe by id and unshift
      const existing = cur.filter((r) => r.id !== compactEntry.id);
      const next = [compactEntry, ...existing].slice(0, 10);

      // write to storage and update component state (we will re-attach full raw object when opening)
      localStorage.setItem("sr_recent_shipments", JSON.stringify(next));
      setRecent(next.map((r) => ({ ...r, raw: null }))); // raw will be null until user opens and we fetch again
      console.debug("Updated recent list:", next);
    } catch (e) {
      console.warn("Failed inside addToRecent", e);
    }
  };

  // --- Search / scan flow -------------------------------------------

  // call to fetch and then route to details
  const handleSearch = async (fromScanner = false) => {
    const trimmed = trackingInput.trim();
    if (!trimmed) return;

    setLoading(true);
    setApiError("");

    try {
      const data = await loadTrackingDetails(trimmed);
      console.log("CAP trackingDetails response:", data);

      const first = data && Array.isArray(data.value) ? data.value[0] : data;
      if (!first) {
        setApiError("No shipment found for this ID.");
        return;
      }

      // parse FinalInfo string into stops array
      const stops = parseFinalInfo(first.FinalInfo);

      // prepare a selectable payload for details page
      const shipmentPayload = {
        FoId: first.FoId || trimmed,
        raw: first,
        stops: stops,
        latitude: first.Latitude,
        longitude: first.Longitude,
      };

      // create recent entry — store compact serializable fields
      const recentEntry = {
        id: first.FoId || trimmed,
        status: first.StatusText || "In Transit",
        date: first.PlannedDepDate || new Date().toLocaleDateString("en-GB"),
        time:
          first.PlannedDepTime ||
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        color: "#1976D2",
        iconKey: ICON_KEY_DEFAULT,
        // we intentionally do NOT include `raw` in the persisted entry
      };

      // add to recent (dedupe & persist immediately)
      addToRecent(recentEntry);

      // set selected shipment in top-level App state and switch to track page
      setSelectedShipment(shipmentPayload);
      setActiveTab("track");
    } catch (err) {
      console.error(err);
      setApiError("Error while fetching shipment. Please try again.");
      // preserve recent on error
    } finally {
      setLoading(false);
    }
  };

  const handleScanButton = () => {
    setShowScanner(true);
  };

  const handleScannedCode = (code) => {
    setTrackingInput(code);
    setShowScanner(false);
    setTimeout(() => handleSearch(true), 250);
  };

  // when tapping a recent entry, navigate to details and keep recent unchanged
  const openFromRecent = async (s) => {
    // If we didn't store raw before, re-fetch the tracking details so details page has `raw`
    try {
      const data = await loadTrackingDetails(s.id);
      const first = data && Array.isArray(data.value) ? data.value[0] : data;
      const stops = parseFinalInfo(first?.FinalInfo);
      const shipmentPayload = { FoId: first?.FoId || s.id, raw: first, stops };
      setSelectedShipment(shipmentPayload);
      setActiveTab("track");
    } catch (e) {
      console.error("Failed to open recent item", e);
      setApiError("Failed to load shipment from recent.");
    }
  };

  // --- Render -------------------------------------------------------

  return (
    <div className="w-full flex flex-col items-center pb-6">
      {/* LOGO */}
      <div className="mt-8 mb-6 flex justify-center">
        <img src={logo} alt="App Logo" className="w-28 h-28 object-contain opacity-95" />
      </div>

      {/* INPUT HEADER */}
      <div className="w-full px-4 mb-3 text-center">
        <p className="text-[18px] font-bold" style={{ color: "#071e54" }}>
          Enter Shipment / FO Number
        </p>
      </div>

      {/* SEARCH BAR */}
      <div className="px-4 w-full mt-1">
        <div
          className="flex items-center rounded-full px-4 py-3"
          style={{
            backgroundColor: "#ffffff",
            boxShadow: "8px 8px 16px #d9dce1, -8px -8px 16px #ffffff",
          }}
        >
          <SearchRoundedIcon sx={{ color: "#6b6c6e", marginRight: 1 }} />

          <input
            className="flex-1 bg-transparent outline-none"
            style={{ color: "#071e54", fontSize: "14px" }}
            placeholder="Enter Shipment / FO"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />

          {/* IF INPUT EMPTY → SHOW SCANNER ICON */}
          {trackingInput.length === 0 && (
            <button
              onClick={handleScanButton}
              className="h-9 w-9 flex items-center justify-center rounded-full"
              style={{
                backgroundColor: "#eff0f3",
                boxShadow: "inset 3px 3px 6px #d9dce1, inset -3px -3px 6px #ffffff",
              }}
            >
              <QrCodeScannerIcon sx={{ color: "#1976D2", fontSize: 20 }} />
            </button>
          )}

          {/* IF INPUT HAS TEXT → SHOW SEARCH BUTTON */}
          {trackingInput.length > 0 && (
            <button
              onClick={() => handleSearch(false)}
              disabled={loading}
              className="h-9 px-3 flex items-center justify-center rounded-full text-white font-semibold text-[12px]"
              style={{
                background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 60%, #90CAF9 100%)",
                boxShadow: "inset 1px 1px 3px rgba(255,255,255,0.2), inset -2px -2px 4px rgba(0,0,0,0.08)",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Loading…" : "Search"}
            </button>
          )}
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {apiError && (
        <div className="px-4 w-full mt-3 text-[11px] text-red-600 font-medium">
          {apiError}
        </div>
      )}

      {/* RECENT SECTION */}
      <div className="w-full px-4 mt-3 text-center">
        <p className="text-[18px] font-bold" style={{ color: "#071e54" }}>
          Recent
        </p>

        <p className="text-[10px]" style={{ color: "#6b6c6e" }}>
          {recent.length > 0 ? "Last updated just now" : "No recent shipment yet"}
        </p>

        <div className="space-y-3 mt-4">
          {recent.map((s) => (
            <button
              key={s.id}
              className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left border"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#d9dce1",
                boxShadow: "4px 4px 10px #d9dce1, -4px -4px 10px #ffffff",
              }}
              onClick={() => openFromRecent(s)}
            >
              {/* Shipment details card */}
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: s.color, color: "white" }}
                >
                  {renderIconForKey(s.iconKey)}
                </div>

                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "#071e54" }}>
                    {s.id}
                  </p>
                  <p className="text-[12px]" style={{ color: "#6b6c6e" }}>
                    {s.status}
                  </p>
                </div>
              </div>

              <div className="text-right text-[12px]" style={{ color: "#6b6c6e" }}>
                {s.date}
                <div className="opacity-70">{s.time}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* SCANNER DIALOG */}
      <BarcodeScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleScannedCode} />
    </div>
  );
}
