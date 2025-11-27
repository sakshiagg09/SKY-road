import React, { useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";

import logo from "../assets/logo.svg";

export default function ShipmentSearchPage() {
  const [trackingInput, setTrackingInput] = useState("");
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // 🔹 Call CAP backend (trackingDetails READ handler)
  async function loadTrackingDetails(trackingId) {
    // TODO: change <service-name> and field name FOID to match your CDS'
  //   const res = await fetch(
  //   `http://localhost:4004/odata/v4/GTT/trackingDetails?$filter=FOID eq '${trackingId}'`
  // );
    const res = await fetch(`http://localhost:4004/odata/v4/gtt/trackingDetails?$filter=FOID eq '${trackingId}'`
      );
    if (!res.ok) {
      throw new Error("Failed to load tracking details");
    }

    const data = await res.json();
    // In CAP v4, this will usually be an array of objects
    return data;
  }

  const handleSearch = async () => {
    const trimmed = trackingInput.trim();
    if (!trimmed) return;

    setLoading(true);
    setApiError("");

    try {
      const data = await loadTrackingDetails(trimmed);
      console.log("CAP trackingDetails response:", data);

      const first = Array.isArray(data) ? data[0] : data;
      if (!first) {
        setApiError("No shipment found for this ID.");
        setRecent([]);
      } else {
        // Map backend fields → UI (adapt this once your CDS fields are fixed)
        setRecent([
          {
            id: trimmed,
            status: first.StatusText || "In Transit",   // adjust to your field, e.g. first.FOStatus
            date: first.PlannedDepDate || new Date().toLocaleDateString("en-GB"),
            time:
              first.PlannedDepTime ||
              new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            color: "#1976D2",
            icon: <LocalShippingOutlinedIcon fontSize="small" />,
            raw: first, // keep full object for Track page
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setApiError("Error while fetching shipment. Please try again.");
      setRecent([]);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = () => {
    console.log("Open barcode scanner...");
  };

  return (
    <div className="w-full flex flex-col items-center pb-6">
      {/* LOGO */}
      <div className="mt-8 mb-6 flex justify-center">
        <img src={logo} alt="App Logo" className="w-28 h-28 object-contain opacity-95" />
      </div>

      {/* INPUT HEADER */}
      <div className="w-full px-4 mb-2">
        <p className="text-[13px] font-semibold" style={{ color: "#071e54" }}>
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
              onClick={handleScan}
              className="h-9 w-9 flex items-center justify-center rounded-full"
              style={{
                backgroundColor: "#eff0f3",
                boxShadow:
                  "inset 3px 3px 6px #d9dce1, inset -3px -3px 6px #ffffff",
              }}
            >
              <QrCodeScannerIcon sx={{ color: "#1976D2", fontSize: 20 }} />
            </button>
          )}

          {/* IF INPUT HAS TEXT → SHOW SEARCH BUTTON */}
          {trackingInput.length > 0 && (
            <button
              onClick={handleSearch}
              disabled={loading}
              className="h-9 px-3 flex items-center justify-center rounded-full text-white font-semibold text-[12px]"
              style={{
                background:
                  "linear-gradient(135deg, #1976D2 0%, #42A5F5 60%, #90CAF9 100%)",
                boxShadow:
                  "inset 1px 1px 3px rgba(255,255,255,0.2), inset -2px -2px 4px rgba(0,0,0,0.08)",
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
      <div className="px-4 w-full mt-8 pb-4">
        <p className="text-[15px] font-semibold mb-1" style={{ color: "#071e54" }}>
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
              onClick={() => {
                console.log("Open shipment details:", s.raw);
                // later: setSelectedShipment(s.raw); setActiveTab("track");
              }}
            >
              {/* Shipment details card */}
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: s.color, color: "white" }}
                >
                  {s.icon}
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
    </div>
  );
}
