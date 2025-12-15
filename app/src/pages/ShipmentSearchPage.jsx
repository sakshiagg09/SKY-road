// app/src/pages/ShipmentSearchPage.jsx
import { useEffect, useState, useRef } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import DocumentScannerRoundedIcon from "@mui/icons-material/DocumentScannerRounded"; // ✅ NEW
import { LinearProgress } from "@mui/material";

import logo from "../assets/logo.png.png";
import BarcodeScanner from "../components/BarcodeScanner";

/**
 * Props:
 *  - setSelectedShipment(fn)
 *  - setActiveTab(fn)
 */
export default function ShipmentSearchPage({ setSelectedShipment, setActiveTab }) {
  const [trackingInput, setTrackingInput] = useState(""); // FO / Shipment
  const [licenseInput, setLicenseInput] = useState(""); // Driver License
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  // ✅ hidden input for OCR image capture
  const licenseFileRef = useRef(null);

  const ICON_KEY_DEFAULT = "truck";

  const renderIconForKey = (key) => {
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
          const sanitized = parsed.map((r) => ({
            id: r.id,
            status: r.status,
            date: r.date,
            time: r.time,
            color: r.color || "#1976D2",
            iconKey: typeof r.iconKey === "string" ? r.iconKey : ICON_KEY_DEFAULT,
            licenseNumber: r.licenseNumber || "",
            raw: null,
          }));
          setRecent(sanitized);
        }
      }
    } catch (e) {
      console.warn("Failed to load recent from localStorage", e);
      setRecent([]);
    }
  }, []);

  // Helper: parse FinalInfo -> array of stops
  const parseFinalInfo = (finalInfoValue) => {
    if (!finalInfoValue) return [];
    try {
      if (typeof finalInfoValue === "string") return JSON.parse(finalInfoValue);
      if (Array.isArray(finalInfoValue)) return finalInfoValue;
      return [];
    } catch (e) {
      console.error("Failed to parse FinalInfo:", e, finalInfoValue);
      return [];
    }
  };

  // --- API: trackingDetails now requires FoId + DriverLicense ----------
  async function loadTrackingDetails(trackingId, licenseNumber) {
    const res = await fetch(
      `odata/v4/GTT/trackingDetails?$filter=FoId eq '${trackingId}' and DriverLicense eq '${licenseNumber}'`
    );
    if (!res.ok) throw new Error("Failed to load tracking details");
    return await res.json();
  }

  // ✅ OCR call (CAP action) – returns { licenseNumber, confidence }
  async function extractLicenseNumberFromImage(base64) {
    const res = await fetch("/odata/v4/GTT/extractLicenseNumber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OCR failed (${res.status}). ${txt}`);
    }
    return await res.json();
  }

  // ✅ file -> base64 (without data:image/... prefix)
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") return resolve("");
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ✅ click OCR icon
  const handleLicenseOcrClick = () => {
    setApiError("");
    if (licenseFileRef.current) licenseFileRef.current.click();
  };

  // ✅ when user selects / captures image
  const handleLicenseFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow same file again next time
    if (!file) return;

    try {
      setLoading(true);
      setApiError("");

      const base64 = await fileToBase64(file);
      if (!base64) throw new Error("Could not read image.");

      const out = await extractLicenseNumberFromImage(base64);

      const lic =
        out?.licenseNumber ||
        out?.d?.licenseNumber ||
        out?.value?.licenseNumber ||
        "";

      if (!lic) {
        setApiError("OCR could not detect License Number. Please try again.");
        return;
      }

      setLicenseInput(String(lic).trim());
    } catch (err) {
      console.error(err);
      setApiError(err?.message || "License OCR failed.");
    } finally {
      setLoading(false);
    }
  };

  // update recent list — now also stores licenseNumber
  const addToRecent = (entry) => {
    try {
      const raw = localStorage.getItem("sr_recent_shipments");
      let cur = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) cur = parsed;
        } catch {
          cur = [];
        }
      }

      const compactEntry = {
        id: entry.id,
        status: entry.status,
        date: entry.date,
        time: entry.time,
        color: entry.color || "#1976D2",
        iconKey: entry.iconKey || ICON_KEY_DEFAULT,
        licenseNumber: entry.licenseNumber || "",
      };

      const existing = cur.filter((r) => r.id !== compactEntry.id);
      const next = [compactEntry, ...existing].slice(0, 10);

      localStorage.setItem("sr_recent_shipments", JSON.stringify(next));
      setRecent(next.map((r) => ({ ...r, raw: null })));
    } catch (e) {
      console.warn("Failed inside addToRecent", e);
    }
  };

  // --- Search / scan flow -------------------------------------------
  const handleSearch = async () => {
    const fo = trackingInput.trim();
    const license = licenseInput.trim();

    if (!fo || !license) {
      setApiError("Freight Order and License Number are both required.");
      return;
    }

    setLoading(true);
    setApiError("");

    try {
      const data = await loadTrackingDetails(fo, license);
      const first = data && Array.isArray(data.value) ? data.value[0] : data;
      if (!first) {
        setApiError("No shipment found for this FO + License combination.");
        return;
      }

      const stops = parseFinalInfo(first.FinalInfo);

      const shipmentPayload = {
        FoId: first.FoId || fo,
        raw: first,
        stops,
        latitude: first.Latitude,
        longitude: first.Longitude,
        licenseNumber: license,
      };

      const recentEntry = {
        id: first.FoId || fo,
        status: first.StatusText || "In Transit",
        date: first.PlannedDepDate || new Date().toLocaleDateString("en-GB"),
        time:
          first.PlannedDepTime ||
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        color: "#1976D2",
        iconKey: ICON_KEY_DEFAULT,
        licenseNumber: license,
      };

      addToRecent(recentEntry);

      setSelectedShipment(shipmentPayload);
      setActiveTab("track");
    } catch (err) {
      console.error(err);
      setApiError("Error while fetching shipment. Please verify FO & License.");
    } finally {
      setLoading(false);
    }
  };

  const handleScanButton = () => setShowScanner(true);

  const handleScannedCode = (code) => {
    setTrackingInput(code);
    setShowScanner(false);
  };

  const openFromRecent = async (s) => {
    if (!s.licenseNumber) {
      alert(
        "This shipment was saved before license-based search was enabled. Please search again using FO and License Number."
      );
      return;
    }

    setLoading(true);
    setApiError("");

    try {
      const data = await loadTrackingDetails(s.id, s.licenseNumber);
      const first = data && Array.isArray(data.value) ? data.value[0] : data;
      if (!first) {
        setApiError("No shipment found for this FO + License combination.");
        return;
      }
      const stops = parseFinalInfo(first?.FinalInfo);
      const shipmentPayload = {
        FoId: first?.FoId || s.id,
        raw: first,
        stops,
        latitude: first.Latitude,
        longitude: first.Longitude,
        licenseNumber: s.licenseNumber,
      };
      setSelectedShipment(shipmentPayload);
      setActiveTab("track");
    } catch (e) {
      console.error("Failed to open recent item", e);
      setApiError("Failed to load shipment from recent.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center pb-6">
      {loading && (
        <div className="w-full px-4 pt-2">
          <LinearProgress />
        </div>
      )}

      <div className="mt-8 mb-6 flex justify-center">
        <img src={logo} alt="App Logo" className="w-28 h-28 object-contain opacity-95" />
      </div>

      <div className="w-full px-4 mb-3 text-center">
        <p className="text-[18px] font-bold" style={{ color: "#071e54" }}>
          Enter FO & License Number
        </p>
        <p className="text-[11px] mt-1" style={{ color: "#6b6c6e" }}>
          Both fields are mandatory to fetch shipment details.
        </p>
      </div>

      <div className="px-4 w-full mt-1">
        {/* FO INPUT */}
        <div
          className="flex items-center rounded-full px-4 py-3 mb-3"
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
        </div>

        {/* LICENSE INPUT + ✅ OCR ICON */}
        <div
          className="flex items-center rounded-full px-4 py-3"
          style={{
            backgroundColor: "#ffffff",
            boxShadow: "8px 8px 16px #d9dce1, -8px -8px 16px #ffffff",
          }}
        >
          <LocalShippingOutlinedIcon sx={{ color: "#6b6c6e", marginRight: 1 }} />

          <input
            className="flex-1 bg-transparent outline-none"
            style={{ color: "#071e54", fontSize: "14px" }}
            placeholder="Enter Driver License Number"
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />

          {/* ✅ OCR scan icon */}
          <button
            onClick={handleLicenseOcrClick}
            disabled={loading}
            className="h-9 w-9 flex items-center justify-center rounded-full"
            style={{
              backgroundColor: "#eff0f3",
              boxShadow: "inset 3px 3px 6px #d9dce1, inset -3px -3px 6px #ffffff",
              opacity: loading ? 0.6 : 1,
              marginLeft: 8,
            }}
            title="Scan license using OCR"
          >
            <DocumentScannerRoundedIcon sx={{ color: "#1976D2", fontSize: 20 }} />
          </button>

          {/* ✅ hidden file input */}
          <input
            ref={licenseFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleLicenseFilePicked}
          />
        </div>

        {/* SEARCH BUTTON */}
        <div className="w-full mt-3 flex justify-end">
          <button
            onClick={handleSearch}
            disabled={loading || trackingInput.trim().length === 0 || licenseInput.trim().length === 0}
            className="h-9 px-4 flex items-center justify-center rounded-full text-white font-semibold text-[12px]"
            style={{
              background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 60%, #90CAF9 100%)",
              boxShadow: "inset 1px 1px 3px rgba(255,255,255,0.2), inset -2px -2px 4px rgba(0,0,0,0.08)",
              opacity: loading || !trackingInput.trim() || !licenseInput.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "Fetching…" : "Search"}
          </button>
        </div>
      </div>

      {apiError && (
        <div className="px-4 w-full mt-3 text-[11px] text-red-600 font-medium">
          {apiError}
        </div>
      )}

      {/* RECENT */}
      <div className="w-full px-4 mt-4 text.center">
        <p className="text-[18px] font-bold" style={{ color: "#071e54" }}>
          Recent
        </p>
        <p className="text-[10px]" style={{ color: "#6b6c6e" }}>
          {recent.length > 0 ? "Last updated just now" : "No recent shipment yet"}
        </p>

        <div className="space-y-3 mt-4">
          {recent.map((s) => (
            <button
              key={s.id + (s.licenseNumber || "")}
              className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left border"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#d9dce1",
                boxShadow: "4px 4px 10px #d9dce1, -4px -4px 10px #ffffff",
              }}
              onClick={() => openFromRecent(s)}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: s.color, color: "white" }}>
                  {renderIconForKey(s.iconKey)}
                </div>

                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "#071e54" }}>
                    {s.id}
                  </p>
                  <p className="text-[12px]" style={{ color: "#6b6c6e" }}>
                    {s.status}
                  </p>
                  {s.licenseNumber && (
                    <p className="text-[10px]" style={{ color: "#6b6c6e" }}>
                      License: {s.licenseNumber}
                    </p>
                  )}
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

      {/* FO BARCODE SCANNER */}
      <BarcodeScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleScannedCode} />
    </div>
  );
}
