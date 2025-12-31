// app/src/pages/ShipmentDetailsPage.jsx
import React, { useState, useCallback, useEffect, useMemo } from "react";
import TimelineIcon from "@mui/icons-material/Timeline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import ScaleOutlinedIcon from "@mui/icons-material/ScaleOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";

import RouteTimeline from "./RouteTimeline";
import PodFlowDialog from "../components/PodFlowDialog"; // 👈 adjust path if needed

/**
 * Props:
 *  - selectedShipment
 *  - onAction?: (action: string, payload: any) => void
 */
export default function ShipmentDetailsPage({ selectedShipment, onAction }) {
  const BG = "#EFF0F3";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  // progress is set from RouteTimeline via onAction("progress", percent)
  const [progress, setProgress] = useState(60);

  // 🔹 POD dialog state
  const [podOpen, setPodOpen] = useState(false);
  const [podContext, setPodContext] = useState({ stop: null, FoId: null });

  // 🔹 Info about last successfully completed POD (to update timeline)
  const [podCompletedInfo, setPodCompletedInfo] = useState(null);

  // ✅ LIVE tracking UI (non-breaking: only affects ETA display if we can compute)
  const [liveEtaText, setLiveEtaText] = useState(null);
  const [liveMeta, setLiveMeta] = useState({ distanceKm: null, updatedAt: null });

  if (!selectedShipment) {
    return (
      <div
        className="min-h-screen w-full px-4 pt-6 pb-24"
        style={{ backgroundColor: BG, fontFamily: "Inter, system-ui, sans-serif" }}
      >
        <h2 style={{ color: TEXT_PRIMARY, fontSize: 18, fontWeight: 600 }}>
          No shipment selected
        </h2>
        <p style={{ color: TEXT_SECONDARY, marginTop: 8, fontSize: 13 }}>
          Please scan or search a Freight Order to view its details.
        </p>
      </div>
    );
  }

  const { FoId, stops = [], raw = {} } = selectedShipment;

  const stopsCount = Array.isArray(stops) ? stops.length : 0;

  // derive origin/destination from available stops dynamically
  const sortedStopsForHeader = Array.isArray(stops)
    ? [...stops].sort((a, b) => {
        const ta = new Date(a.dateTime || a.dateTimeString || 0).getTime() || 0;
        const tb = new Date(b.dateTime || b.dateTimeString || 0).getTime() || 0;
        return ta - tb;
      })
    : [];

  const firstStop = sortedStopsForHeader[0];
  const lastStop = sortedStopsForHeader[sortedStopsForHeader.length - 1];

  const origin = firstStop
    ? `${firstStop.name || firstStop.name1 || firstStop.locId || firstStop.locid || ""}${
        firstStop.city ? `, ${firstStop.city}` : ""
      }${firstStop.country ? `, ${firstStop.country}` : ""}`
    : "-";

  const destination = lastStop
    ? `${lastStop.name || lastStop.name1 || lastStop.locId || lastStop.locid || ""}${
        lastStop.city ? `, ${lastStop.city}` : ""
      }${lastStop.country ? `, ${lastStop.country}` : ""}`
    : "-";

  // Planned ETA (existing behavior)
  const eta = lastStop
    ? new Date(
        lastStop.dateTime || lastStop.dateTimeString || lastStop.plannedDateTime
      ).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })
    : "-";

  // ==========================
  // ✅ Live ETA helpers (safe)
  // ==========================
  const haversineKm = (a, b) => {
    if (!a || !b) return null;
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(s));
  };

  const formatEta = (ms) =>
    new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });

  // Best-effort destination coordinates (does NOT break if missing)
  const destinationCoords = useMemo(() => {
    // 1) last stop coords (if your backend provides)
    const lat = lastStop?.Latitude ?? lastStop?.latitude ?? lastStop?.lat ?? null;
    const lng = lastStop?.Longitude ?? lastStop?.longitude ?? lastStop?.lng ?? null;

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }

    // 2) try raw destination coords (adjust later if your payload uses different names)
    const rLat = raw?.DestLatitude ?? raw?.DestinationLatitude ?? raw?.ToLat ?? null;
    const rLng = raw?.DestLongitude ?? raw?.DestinationLongitude ?? raw?.ToLng ?? null;

    if (Number.isFinite(Number(rLat)) && Number.isFinite(Number(rLng))) {
      return { lat: Number(rLat), lng: Number(rLng) };
    }

    return null;
  }, [lastStop, raw]);

  // Compute live ETA from last location stored by DriverTrackingManager
  useEffect(() => {
    const tick = () => {
      try {
        const rawLoc = localStorage.getItem("sky_last_loc");
        if (!rawLoc) return;

        const p = JSON.parse(rawLoc);
        if (!p?.Latitude || !p?.Longitude) return;

        const cur = { lat: Number(p.Latitude), lng: Number(p.Longitude) };
        const updatedAt = p.Timestamp ? Number(p.Timestamp) : Date.now();

        // if no destination coords, keep planned ETA (no changes)
        if (!destinationCoords) {
          setLiveEtaText(null);
          setLiveMeta({ distanceKm: null, updatedAt });
          return;
        }

        const distanceKm = haversineKm(cur, destinationCoords);
        if (distanceKm == null) {
          setLiveEtaText(null);
          setLiveMeta({ distanceKm: null, updatedAt });
          return;
        }

        // Speed best-effort:
        // - if Speed <= 60 treat as m/s -> convert to km/h
        // - else treat as km/h
        let speedKmh = null;
        if (p.Speed != null) {
          const s = Number(p.Speed);
          if (Number.isFinite(s)) speedKmh = s <= 60 ? s * 3.6 : s;
        }

        // fallback to reasonable speed if missing/too low
        if (!speedKmh || speedKmh < 5) speedKmh = 45;

        const etaMs = Date.now() + (distanceKm / speedKmh) * 3600 * 1000;

        setLiveEtaText(formatEta(etaMs));
        setLiveMeta({ distanceKm, updatedAt });
      } catch {
        // ignore
      }
    };

    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [destinationCoords]);

  // Handler to receive callbacks from RouteTimeline
  const handleChildAction = useCallback(
    (action, payload) => {
      if (action === "progress" && typeof payload === "number") {
        setProgress(payload);
      }

      // 🔹 when RouteTimeline asks for POD, open dialog
      if (action === "pod" && payload) {
        const stop = payload.stop || payload; // support both shapes
        setPodContext({
          stop,
          FoId: String(selectedShipment.FoId || selectedShipment.foId || ""),
        });
        setPodOpen(true);
      }

      if (action === "nextStop") {
        if (typeof onAction === "function") onAction("nextStop", payload);
        return;
      }

      // still bubble up to parent if they passed onAction
      if (typeof onAction === "function") onAction(action, payload);
    },
    [onAction, selectedShipment.FoId, selectedShipment.foId]
  );

  // called AFTER POD successfully posted (from PodFlowDialog)
  const handlePodSubmit = ({ payload, response }) => {
    console.log("POD successfully posted:", { payload, response });

    const event = (response && response.Event) || "POD";
    const foIdFromResponse = response && response.FoId;
    const stopIdFromResponse = response && response.StopId;

    const fallbackFoId =
      (payload && payload.FoId) || String(selectedShipment.FoId || selectedShipment.foId || "");
    const fallbackStopId = payload && payload.StopId;

    const effectiveFoId = foIdFromResponse || fallbackFoId;
    const effectiveStopId = stopIdFromResponse || fallbackStopId;

    if (!effectiveStopId) {
      // If StopId is empty in response and payload, we can't map it to a stop.
      console.warn(
        "POD completed but StopId is missing in response/payload. Timeline cannot be updated.",
        { payload, response }
      );
      return;
    }

    setPodCompletedInfo({
      foId: effectiveFoId,
      stopId: effectiveStopId,
      event,
      ts: Date.now(), // used to force React updates even for same stop
    });
  };

  return (
    <div
      className="min-h-screen w-full px-4 pt-4 pb-24"
      style={{ backgroundColor: BG, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* TITLE */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: TEXT_SECONDARY }}>
          Shipment overview
        </p>
        <h2 className="font-semibold" style={{ fontSize: 20, color: TEXT_PRIMARY, marginTop: 4 }}>
          Shipment #{FoId || "-"}
        </h2>
      </div>

      {/* HERO CARD */}
      <div
        className="rounded-3xl p-4 mb-5"
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f3f6ff 40%, #e0ebff 100%)",
          boxShadow: "10px 10px 20px #d7dae2, -10px -10px 20px #ffffff",
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <span
            className="px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{
              backgroundColor: "rgba(25,118,210,0.08)",
              color: PRIMARY,
            }}
          >
            In Transit
          </span>
        </div>

        {/* Route row */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>
              From
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: TEXT_PRIMARY }}
              title={origin}
            >
              {origin}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <TimelineIcon sx={{ fontSize: 20, color: PRIMARY }} />
            <div
              style={{
                width: 1,
                height: 24,
                background: "linear-gradient(to bottom, rgba(25,118,210,0.3), transparent)",
              }}
            />
          </div>

          <div className="flex-1 text-right min-w-0">
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>
              To
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: TEXT_PRIMARY }}
              title={destination}
            >
              {destination}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4 mb-3">
          <div className="flex justify-between text-[10px] mb-1">
            <span style={{ color: TEXT_SECONDARY }}>Progress</span>
            <span style={{ color: TEXT_SECONDARY }}>{progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#d9e2f2] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #1976D2 0%, #42A5F5 60%, #90CAF9 100%)",
              }}
            />
          </div>
        </div>

        {/* KPI row */}
        <div className="flex flex-wrap items-center justify-between mt-1 text-[11px] gap-2">
          <div className="flex items-center gap-1.5">
            <RouteOutlinedIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>
              {stopsCount > 1 ? `${Math.max(0, stopsCount - 1)} legs` : "1 leg"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <AccessTimeIcon sx={{ fontSize: 16, color: PRIMARY }} />
            {/* ✅ Non-breaking: show live ETA if available, else planned ETA */}
            <span style={{ color: TEXT_SECONDARY }}>ETA {liveEtaText || eta}</span>
          </div>
        </div>

        {/* ✅ Optional: small live tracking meta (safe, won't break anything) */}
        {liveMeta?.updatedAt && (
          <p className="text-[10px] mt-2" style={{ color: TEXT_SECONDARY, opacity: 0.8 }}>
            Live tracking: last update{" "}
            {new Date(liveMeta.updatedAt).toLocaleTimeString("en-GB")}{" "}
            {liveMeta.distanceKm != null ? `• ${liveMeta.distanceKm.toFixed(1)} km to destination` : ""}
          </p>
        )}
      </div>

      {/* TIMELINE SECTION */}
      <div className="mt-2">
        <RouteTimeline
          selectedShipment={selectedShipment}
          onAction={handleChildAction}
          podCompletedInfo={podCompletedInfo} // 👈 NEW
        />
      </div>

      {/* 🔹 POD FLOW DIALOG */}
      {podContext.stop && (
        <PodFlowDialog
          open={podOpen}
          stop={podContext.stop}
          foId={podContext.FoId}
          onClose={() => setPodOpen(false)}
          onSubmit={handlePodSubmit}
        />
      )}
    </div>
  );
}
