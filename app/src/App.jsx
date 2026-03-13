// src/App.jsx
import { useState, useEffect, useCallback } from "react";
import { Snackbar, Alert, Backdrop, CircularProgress, Typography, Box } from "@mui/material";

import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";
import VoiceDelaySheet from "./components/VoiceDelaySheet";
import WakeWordListener from "./components/WakeWordListener";
import DriverTrackingManager from "./tracking/DriverTrackingManager";
import { Capacitor } from "@capacitor/core";
import { loginPKCE, loadToken } from "./auth/auth";
import { apiGet, apiPost } from "./auth/api";
import AttachmentsPage from "./pages/AttachmentsPage";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);

  const [nextStop, setNextStop] = useState(null); // keep (no break)

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceAutoStart, setVoiceAutoStart] = useState(false);
  const [reportInitialValues, setReportInitialValues] = useState(null);

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  const [delayReportedInfo, setDelayReportedInfo] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });
  const [submitting, setSubmitting] = useState(false);

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

  const parseSapDt = (dt) => {
    if (!dt || String(dt).length < 14) return null;
    const s = String(dt);
    return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`);
  };

  const formatSapDt = (date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
      pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds());
  };

  const toS4TimestampUTC = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds())
    );
  };

  const autoSubmitVoiceDelay = async (result) => {
    setSubmitting(true);
    const raw = selectedShipment?.raw ?? selectedShipment ?? {};
    const FoId = raw?.FoId ?? selectedShipment?.FoId ?? "";

    const safeJsonArray = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        const s = v.trim();
        if (!s || s === "0") return [];
        try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : []; } catch { return []; }
      }
      return [];
    };

    const finalInfoArr = safeJsonArray(raw?.FinalInfo);
    const stopsArr = safeJsonArray(raw?.Stops);

    const isStopDeparted = (stop) => {
      const locid = String(stop?.locid ?? stop?.locId ?? "").trim();
      const seq = String(stop?.stopseqpos ?? stop?.stopSeqPos ?? "").trim().toUpperCase();
      const fi = finalInfoArr.find((x) => {
        const fLoc = String(x?.locid ?? x?.locId ?? "").trim();
        const fSeq = String(x?.stopseqpos ?? x?.stopSeqPos ?? "").trim().toUpperCase();
        return fLoc === locid && fSeq === seq;
      });
      return String(fi?.event ?? fi?.Event ?? "").toUpperCase().includes("DEPART");
    };

    const upcomingStops = stopsArr.filter((s, idx) => {
      if (idx === 0) return false;
      const seq = String(s?.stopseqpos ?? s?.stopSeqPos ?? "").trim().toUpperCase();
      if (seq === "F") return false;
      return !isStopDeparted(s);
    });

    if (upcomingStops.length === 0 || !FoId) {
      setSubmitting(false);
      setSnack({ open: true, message: "Could not auto-submit: no upcoming stops or missing shipment.", severity: "warning" });
      return;
    }

    const firstStop = upcomingStops[0];
    const locid = String(firstStop?.locid ?? firstStop?.locId ?? "").trim();
    const seq = String(firstStop?.stopseqpos ?? firstStop?.stopSeqPos ?? "").trim().toUpperCase();

    // Resolve StopId from FinalInfo (same logic as ReportEventDialog)
    let fi = null;
    if (seq === "I") {
      fi = finalInfoArr.find((x) => {
        const fLoc = String(x?.locid ?? x?.locId ?? "").trim();
        const fSeq = String(x?.stopseqpos ?? x?.stopSeqPos ?? "").trim().toUpperCase();
        const itemCat = String(x?.itemcat ?? x?.item_cat ?? x?.itemCat ?? "").trim().toUpperCase();
        return fLoc === locid && fSeq === "I" && itemCat === "PKG";
      });
      if (!fi) {
        fi = finalInfoArr.find((x) => {
          const fLoc = String(x?.locid ?? x?.locId ?? "").trim();
          const fSeq = String(x?.stopseqpos ?? x?.stopSeqPos ?? "").trim().toUpperCase();
          return fLoc === locid && fSeq === "I";
        });
      }
    } else {
      fi = finalInfoArr.find((x) => {
        const fLoc = String(x?.locid ?? x?.locId ?? "").trim();
        const fSeq = String(x?.stopseqpos ?? x?.stopSeqPos ?? "").trim().toUpperCase();
        return fLoc === locid && fSeq === seq;
      });
    }

    const StopId = String(fi?.stopid ?? fi?.stopId ?? "").trim();

    // Coords from Stops
    const st = stopsArr.find((s) => {
      const sLoc = String(s?.locid ?? s?.locId ?? "").trim();
      const sSeq = String(s?.stopseqpos ?? s?.stopSeqPos ?? "").trim().toUpperCase();
      return sLoc === locid && sSeq === seq;
    });
    const stopLat = Number(st?.latitude ?? st?.Latitude ?? null);
    const stopLng = Number(st?.longitude ?? st?.Longitude ?? null);

    // GPS from localStorage
    let useLat = null;
    let useLng = null;
    try {
      const rawLoc = localStorage.getItem("sky_last_loc");
      if (rawLoc) {
        const p = JSON.parse(rawLoc);
        const lat = Number(p?.Latitude);
        const lng = Number(p?.Longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) { useLat = lat; useLng = lng; }
      }
    } catch {}
    useLat = useLat ?? (Number.isFinite(stopLat) ? stopLat : null);
    useLng = useLng ?? (Number.isFinite(stopLng) ? stopLng : null);

    // Fetch reason codes + fuzzy-match reasonHint
    let eventCode = "DELAYED";
    try {
      const data = await apiGet("/odata/v4/GTT/delayEvents");
      const rows = Array.isArray(data.value) ? data.value : [];
      if (rows.length > 0) {
        let matched = null;
        if (result.reasonHint) {
          const hint = result.reasonHint.toLowerCase();
          matched = rows.find((r) => (r.Description || "").toLowerCase().includes(hint));
        }
        eventCode = ((matched ?? rows[0]).EvtReasonCode) || "DELAYED";
      }
    } catch (e) {
      console.log("autoSubmit: failed to fetch reason codes, using DELAYED", e);
    }

    const etaDate = new Date(Date.now() + (result.delayMinutes || 0) * 60000);
    const payload = {
      FoId,
      StopId: StopId || "",
      ETA: toS4TimestampUTC(etaDate),
      RefEvent: "Arrival",
      EventCode: eventCode,
      Latitude: useLat == null ? "" : String(useLat),
      Longitude: useLng == null ? "" : String(useLng),
      Timestamp: toS4TimestampUTC(new Date()),
    };

    if (!payload.StopId) {
      console.warn("[autoSubmit] Could not resolve StopId, submitting anyway without it");
    }

    try {
      await apiPost("/odata/v4/GTT/delayEvents", payload);
      const delayLabel = result.delayMinutes > 0 ? ` (${result.delayMinutes} min)` : "";
      setDelayReportedInfo({ event: "Delay", stopId: StopId, foId: FoId, ts: Date.now() });
      setSnack({ open: true, message: `Delay reported successfully${delayLabel}.`, severity: "success" });
    } catch (err) {
      console.error("autoSubmit delay failed:", err);
      setSnack({ open: true, message: "Failed to report delay. Please try again.", severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoiceResult = (result) => {
    setVoiceOpen(false);
    setVoiceAutoStart(false);
    autoSubmitVoiceDelay(result);
  };

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
      <WakeWordListener
        enabled={hasShipment && !voiceOpen}
        onWakeWord={() => { setVoiceAutoStart(true); setVoiceOpen(true); }}
      />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: contentPaddingBottom }}>
        {renderPage()}
      </div>

      <BottomBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReportClick={() => handleOpenReport("unplanned")}
        onMapClick={openFullRouteInMaps}
        hasShipment={hasShipment}
        onAttachmentsClick={() => setActiveTab("attachments")}
        onVoiceClick={() => { setVoiceAutoStart(false); setVoiceOpen(true); }}
        voiceEnabled={hasShipment && activeTab === "track"}
      />

      <VoiceDelaySheet
        open={voiceOpen}
        autoStart={voiceAutoStart}
        onClose={() => { setVoiceOpen(false); setVoiceAutoStart(false); }}
        onResult={handleVoiceResult}
      />

      <ReportEventDialog
        selectedShipment={selectedShipment}
        open={reportOpen}
        mode={reportMode}
        initialValues={reportInitialValues}
        onClose={() => { handleCloseReport(); setReportInitialValues(null); }}
        onReported={(info) => setDelayReportedInfo(info)}
      />

      <Backdrop open={submitting} sx={{ zIndex: 2000, flexDirection: "column", gap: 2 }}>
        <CircularProgress size={52} thickness={4} sx={{ color: "#fff" }} />
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
            Reporting delay…
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: 13, mt: 0.5 }}>
            Please wait
          </Typography>
        </Box>
      </Backdrop>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: "100%", borderRadius: "12px", fontWeight: 600 }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
