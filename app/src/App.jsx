// src/App.jsx
import { useState, useEffect, useCallback } from "react";

import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";
import DriverTrackingManager from "./tracking/DriverTrackingManager";
import { Capacitor } from "@capacitor/core";
import { loginPKCE, loadToken } from "./auth/auth";
import AttachmentsPage from "./pages/AttachmentsPage"; // ✅ NEW

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);

  const [nextStop, setNextStop] = useState(null); // keep (no break)

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned");

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  const [delayReportedInfo, setDelayReportedInfo] = useState(null);

  useEffect(() => {
    console.log("AUTH: App mounted");

    (async () => {
      const isNative = Capacitor.isNativePlatform();
      const isLocalWeb =
        !isNative && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

      if (isLocalWeb) {
        console.warn("AUTH: Local web dev detected -> bypassing login");
        setAuthenticated(true);
        return;
      }

      const tokenObj = await loadToken();
      const token = tokenObj?.access_token || null;

      if (!token) await loginPKCE(() => setAuthenticated(true));
      else setAuthenticated(true);
    })().catch((e) => console.log("AUTH init error", e));
  }, []);

  const handleOpenReport = (mode = "unplanned") => {
    setReportMode(mode);
    setReportOpen(true);
  };

  const handleCloseReport = () => setReportOpen(false);

  // Minimal lat/long extractor (numeric only)
  const stopLatLng = (s) => {
    const lat = Number(s?.latitude ?? s?.Latitude ?? s?.lat);
    const lng = Number(s?.longitude ?? s?.Longitude ?? s?.lng ?? s?.long);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 || lng === 0) return null;

    return `${lat},${lng}`;
  };

  // Build a clean, Google-friendly address string (address-based routing only)
  const stopLabel = (s) => {
    const street = s?.street || s?.street1 || s?.address || s?.address1 || "";
    const city = s?.city || s?.city1 || "";
    const state = s?.state || s?.region || s?.province || "";
    const postal = s?.pincode || s?.pinCode || s?.postCode || s?.postalCode || s?.zip || "";
    const country = s?.country || s?.countryCode || "";

    return [street, city, state, postal, country]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(", ");
  };

  const toMapsPoint = (s) => {
    return stopLatLng(s) || stopLabel(s) || null;
  };

  const sortStops = (stops) => {
    if (!Array.isArray(stops)) return [];

    const getSeq = (s) =>
      s?.stopSequence ?? s?.sequence ?? s?.stopNo ?? s?.stopNumber ?? null;

    return [...stops].sort((a, b) => {
      const sa = Number(getSeq(a));
      const sb = Number(getSeq(b));

      if (Number.isFinite(sa) && Number.isFinite(sb)) return sa - sb;

      const ta = new Date(a?.dateTime || a?.plannedDateTime || 0).getTime() || 0;
      const tb = new Date(b?.dateTime || b?.plannedDateTime || 0).getTime() || 0;
      return ta - tb;
    });
  };
  const getStopsFromShipment = (shipment) => {
  if (!shipment) return [];

  // 1) If you already have normalized stops array
  if (Array.isArray(shipment.stops) && shipment.stops.length) return shipment.stops;

  // 2) If stops come as JSON string (trackingDetails payload)
  const rawStops = shipment?.raw?.Stops ?? shipment?.Stops ?? null;
  if (!rawStops) return [];

  try {
    const arr = typeof rawStops === "string" ? JSON.parse(rawStops) : rawStops;
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.log("getStopsFromShipment: failed to parse Stops", e, rawStops);
    return [];
  }
};

// ✅ Use raw.Stops for coordinates, enrich stopid from FinalInfo when possible
const getStopsForMap = (shipment) => {
  if (!shipment) return [];

  const rawStops = shipment?.raw?.Stops ?? shipment?.Stops ?? null;
  const rawFinal = shipment?.raw?.FinalInfo ?? shipment?.FinalInfo ?? null;

  let stops = [];
  let finalInfo = [];

  try {
    stops = typeof rawStops === "string" ? JSON.parse(rawStops) : rawStops;
    if (!Array.isArray(stops)) stops = [];
  } catch {
    stops = [];
  }

  try {
    finalInfo = typeof rawFinal === "string" ? JSON.parse(rawFinal) : rawFinal;
    if (!Array.isArray(finalInfo)) finalInfo = [];
  } catch {
    finalInfo = [];
  }

  // Build a map to attach stopid using (locid + seqpos)
  const stopIdByLocSeq = new Map();
  finalInfo.forEach((f) => {
    const loc = String(f?.locid ?? f?.locId ?? "").trim();
    const seq = String(f?.stopseqpos ?? f?.stopSeqPos ?? "").trim().toUpperCase();
    const sid = String(f?.stopid ?? f?.stopId ?? "").trim();
    if (loc && seq && sid && !stopIdByLocSeq.has(`${loc}|${seq}`)) {
      stopIdByLocSeq.set(`${loc}|${seq}`, sid);
    }
  });

  // Normalize Stops array (this has latitude/longitude)
  return stops.map((s, idx) => {
    const loc = String(s?.locid ?? s?.locId ?? "").trim();
    const seq = String(s?.stopseqpos ?? s?.stopSeqPos ?? "").trim().toUpperCase();
    const stopid =
      String(s?.stopid ?? s?.stopId ?? "").trim() ||
      stopIdByLocSeq.get(`${loc}|${seq}`) ||
      `${loc}_${seq}_${idx}`;

    return {
      ...s,
      locid: loc,
      stopseqpos: seq,
      stopid,
      latitude: s?.latitude ?? s?.Latitude ?? s?.lat ?? null,
      longitude: s?.longitude ?? s?.Longitude ?? s?.lng ?? s?.long ?? null,
    };
  });
};

const openFullRouteInMaps = useCallback(() => {
  const shipment = selectedShipment;
  const stops = getStopsForMap(shipment);

  console.log("MAP stops (from raw.Stops):", stops);

  if (!shipment || stops.length < 2) {
    alert("Route not available yet. Please open a shipment with at least 2 stops.");
    return;
  }

  const toPoint = (s) => {
    const lat = Number(s?.latitude ?? s?.Latitude ?? s?.lat);
    const lng = Number(s?.longitude ?? s?.Longitude ?? s?.lng ?? s?.long);

    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      return `${lat},${lng}`;
    }

    const street = s?.street || "";
    const city = s?.city || s?.city1 || "";
    const state = s?.state || s?.region || "";
    const postal = s?.postCode || s?.postCode1 || "";
    const country = s?.country || "";

    const label = [street, city, state, postal, country]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(", ");

    return label || null;
  };

  const points = stops.map(toPoint).filter(Boolean);

  if (points.length < 2) {
    alert("Could not build a route: stops are missing valid latitude/longitude.");
    return;
  }

  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).slice(0, 23);

  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    (waypoints.length ? `&waypoints=${waypoints.map(encodeURIComponent).join("|")}` : "") +
    `&travelmode=driving`;

  window.open(url, "_blank", "noopener,noreferrer");
}, [selectedShipment]);

   const effectiveFoId =
    selectedShipment?.FoId || selectedShipment?.FoID || selectedShipment?.foId || "";
  const hasShipment = Boolean(String(effectiveFoId || "").trim());

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return (
          <ShipmentSearchPage
            setSelectedShipment={setSelectedShipment}
            setActiveTab={setActiveTab}
          />
        );

      case "track":
      return (
        <ShipmentDetailsPage
          selectedShipment={selectedShipment}
          nextStop={nextStop}   // ✅ ADD THIS
          delayReportedInfo={delayReportedInfo}
          onAction={(action, payload) => {
            if (action === "nextStop") setNextStop(payload?.stop || null);
            console.log("Timeline action:", action, payload);
          }}
        />
      );

      case "attachments":
        return (
          <AttachmentsPage
            foId={effectiveFoId}
            onBack={() => setActiveTab("track")}
          />
        );

      default:
        return (
          <ShipmentSearchPage
            setSelectedShipment={setSelectedShipment}
            setActiveTab={setActiveTab}
          />
        );
    }
  };

  if (!authenticated) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        Signing you in…
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#eff0f3",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <DriverTrackingManager authenticated={authenticated} selectedShipment={selectedShipment} />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: contentPaddingBottom }}>
        {renderPage()}
      </div>

      <BottomBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReportClick={() => handleOpenReport("unplanned")}
        onMapClick={openFullRouteInMaps}   // ✅ now opens full route
        // ✅ NEW: attachments wiring
        hasShipment={hasShipment}
        onAttachmentsClick={() => setActiveTab("attachments")}
      />

      <ReportEventDialog
        selectedShipment={selectedShipment}
        open={reportOpen}
        mode={reportMode}
        onClose={handleCloseReport}
        onReported={(info) => setDelayReportedInfo(info)}
      />
    </div>
  );
}
