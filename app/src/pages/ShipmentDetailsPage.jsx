// app/src/pages/ShipmentDetailsPage.jsx
import React, { useState, useCallback, useEffect, useMemo } from "react";
import TimelineIcon from "@mui/icons-material/Timeline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import { apiPost } from "../auth/api";
import RouteTimeline from "./RouteTimeline";
import PodFlowDialog from "../components/PodFlowDialog";

/**
 * Props:
 *  - selectedShipment
 *  - onAction?: (action: string, payload: any) => void
 */
export default function ShipmentDetailsPage({ selectedShipment, onAction,delayReportedInfo  }) {
  const BG = "#EFF0F3";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  // progress is set from RouteTimeline via onAction("progress", percent)
  const [progress, setProgress] = useState(60);

  // POD dialog state
  const [podOpen, setPodOpen] = useState(false);
  const [podContext, setPodContext] = useState({ stop: null, FoId: null });

  // Info about last successfully completed POD (to update timeline)
  const [podCompletedInfo, setPodCompletedInfo] = useState(null);

  // LIVE tracking UI
  const [liveEtaText, setLiveEtaText] = useState(null);
  const [liveMeta, setLiveMeta] = useState({
    distanceKm: null,
    updatedAt: null,
    mins: null,
    target: "destination", // "next stop" | "destination"
  });

  // ✅ ETA target: next pending stop coords (from RouteTimeline)
  const [nextStopCoords, setNextStopCoords] = useState(null);
  const [nextStopId, setNextStopId] = useState(null);

  // Live per-stop ETAs: Map<stopid, { etaMs, text }>
  const [liveStopEtas, setLiveStopEtas] = useState(new Map());

  // ---------- helpers ----------
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Show a clean, driver-friendly ETA: "41 min (19:32)"
  const formatEtaCompact = (baseMs, durationSeconds) => {
    const base = Number.isFinite(baseMs) ? baseMs : Date.now();
    const dur = Number.isFinite(durationSeconds) ? durationSeconds : null;
    if (dur == null) return null;

    const etaMs = base + dur * 1000;
    const mins = Math.max(1, Math.round(dur / 60));
    const timeOnly = new Date(etaMs).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return { text: `${mins} min (${timeOnly})`, mins, etaMs };
  };

  // Extract coords from a stop object (robust)
  const pickStopCoords = (stop) => {
    if (!stop) return null;
    const lat = toNum(stop?.latitude ?? stop?.Latitude ?? stop?.lat);
    const lng = toNum(stop?.longitude ?? stop?.Longitude ?? stop?.lng ?? stop?.long);
    if (lat == null || lng == null) return null;
    if (lat === 0 || lng === 0) return null;
    return { lat, lng };
  };

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
  const stopsMaster = useMemo(() => {
  try {
    const s = raw?.Stops;
    const arr = typeof s === "string" ? JSON.parse(s) : Array.isArray(s) ? s : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}, [raw]);

const stopNameByLocId = useMemo(() => {
  const m = new Map();
  for (const s of stopsMaster) {
    const key = String(s?.locid || "").trim();
    const name = String(s?.name1 || "").trim();
    if (key && name) m.set(key, name);
  }
  return m;
}, [stopsMaster]);

const resolveStopName = (st) => {
  const loc = String(st?.locId || st?.locid || "").trim();
  return (
    st?.name1 ||
    st?.name ||
    st?.LocationName ||
    st?.locationName ||
    (loc ? stopNameByLocId.get(loc) : "") ||
    loc ||
    ""
  );
};

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
  ? `${resolveStopName(firstStop)}${firstStop.city ? `, ${firstStop.city}` : ""}${
      firstStop.country ? `, ${firstStop.country}` : ""
    }`
  : "-";

  const destination = lastStop
  ? `${resolveStopName(lastStop)}${lastStop.city ? `, ${lastStop.city}` : ""}${
      lastStop.country ? `, ${lastStop.country}` : ""
    }`
  : "-";

  // Planned ETA
  const eta = lastStop
    ? new Date(lastStop.dateTime || lastStop.dateTimeString || lastStop.plannedDateTime).toLocaleString(
        "en-US",
        {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      )
    : "-";

  // Fallback destination coordinates (last stop / raw)
  const destinationCoords = useMemo(() => {
    const lat = lastStop?.Latitude ?? lastStop?.latitude ?? lastStop?.lat ?? null;
    const lng = lastStop?.Longitude ?? lastStop?.longitude ?? lastStop?.lng ?? null;

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }

    const rLat = raw?.DestLatitude ?? raw?.DestinationLatitude ?? raw?.ToLat ?? null;
    const rLng = raw?.DestLongitude ?? raw?.DestinationLongitude ?? raw?.ToLng ?? null;

    if (Number.isFinite(Number(rLat)) && Number.isFinite(Number(rLng))) {
      return { lat: Number(rLat), lng: Number(rLng) };
    }

    return null;
  }, [lastStop, raw]);

  // ✅ Live ETA via backend Routes API (multi-stop)
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const rawLoc = localStorage.getItem("sky_last_loc");
        if (!rawLoc) return;

        const p = JSON.parse(rawLoc);
        const curLat = toNum(p?.Latitude);
        const curLng = toNum(p?.Longitude);
        if (curLat == null || curLng == null) return;

        const originPoint = { lat: curLat, lng: curLng };
        const updatedAt = p?.Timestamp ? Number(p.Timestamp) : Date.now();
        const baseMs = Number.isFinite(updatedAt) ? updatedAt : Date.now();

        // Build ordered stop list from stopsMaster (raw.Stops), starting from next pending stop
        const sortedStops = [...stopsMaster].sort((a, b) => {
          const sa = Number(a?.stopseqpos ?? a?.stopSeqPos ?? Infinity);
          const sb = Number(b?.stopseqpos ?? b?.stopSeqPos ?? Infinity);
          return sa - sb;
        });

        // Find index of next stop and slice from there
        let startIdx = 0;
        if (nextStopId) {
          const idx = sortedStops.findIndex(
            (s) => String(s?.stopid ?? s?.stopId ?? "").trim() === nextStopId
          );
          if (idx >= 0) startIdx = idx;
        }
        const pendingStops = sortedStops.slice(startIdx);

        // Build stops array for API (filter to valid coords)
        const stopsForApi = pendingStops.map((s) => ({
          id: String(s?.stopid ?? s?.stopId ?? s?.locid ?? s?.locId ?? "").trim(),
          lat: toNum(s?.latitude ?? s?.Latitude ?? s?.lat),
          lng: toNum(s?.longitude ?? s?.Longitude ?? s?.lng ?? s?.long),
        }));

        const validForApi = stopsForApi.filter(
          (s) => s.lat != null && s.lng != null && s.lat !== 0 && s.lng !== 0
        );

        if (validForApi.length < 1) {
          if (!alive) return;
          setLiveEtaText(null);
          setLiveMeta({ distanceKm: null, updatedAt: baseMs, mins: null, target: "destination" });
          return;
        }

        const j = await apiPost("/api/routes/multi-eta", {
          origin: originPoint,
          stops: validForApi,
          baseMs,
        });

        if (!alive) return;

        const etas = Array.isArray(j?.etas) ? j.etas : [];
        if (etas.length === 0) return;

        // Build liveStopEtas map: stopid → { etaMs, text }
        const etaMap = new Map();
        for (const e of etas) {
          if (!e.id) continue;
          const mins = Math.max(1, Math.round(e.durationSeconds / 60));
          const timeStr = new Date(e.etaMs).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });
          etaMap.set(e.id, { etaMs: e.etaMs, text: `${mins} min (${timeStr})` });
        }
        setLiveStopEtas(etaMap);

        // Progress-bar ETA: use next stop if known, else last stop
        const barEntry = nextStopId && etaMap.has(nextStopId)
          ? etaMap.get(nextStopId)
          : etaMap.get(etas[etas.length - 1]?.id);

        if (barEntry) {
          setLiveEtaText(barEntry.text);
          setLiveMeta({
            distanceKm: null, // multi-eta doesn't return per-leg distance for bar
            updatedAt: baseMs,
            mins: Math.max(1, Math.round((barEntry.etaMs - baseMs) / 60000)),
            target: nextStopId ? "next stop" : "destination",
          });
        }
      } catch {
        // ignore
      }
    };

    tick();
    const id = setInterval(tick, 15000); // 15s (cost control)
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [destinationCoords, nextStopCoords, nextStopId, stopsMaster]);

  // Status badge text + styling based on progress
  const statusLabel = progress >= 100 ? "Completed" : "In Transit";
  const statusBg = progress >= 100 ? "rgba(46,125,50,0.10)" : "rgba(25,118,210,0.08)";
  const statusColor = progress >= 100 ? "#2E7D32" : PRIMARY;

  // Handler to receive callbacks from RouteTimeline
  const handleChildAction = useCallback(
    (action, payload) => {
      if (action === "progress" && typeof payload === "number") {
        setProgress(payload);
      }

      // when RouteTimeline asks for POD, open dialog
      if (action === "pod" && payload) {
        const stop = payload.stop || payload;
        setPodContext({
          stop,
          FoId: String(selectedShipment.FoId || selectedShipment.foId || ""),
        });
        setPodOpen(true);
      }

      // ✅ capture next stop coords + id from RouteTimeline
      if (action === "nextStop") {
        const ns = payload?.stop || null;
        console.log("NEXT STOP RAW:", ns);
        console.log("NEXT STOP COORDS:", pickStopCoords(ns));
        setNextStopCoords(pickStopCoords(ns));
        setNextStopId(String(ns?.stopid ?? ns?.stopId ?? "").trim() || null);
        if (typeof onAction === "function") onAction("nextStop", payload);
        return;
      }

      // bubble up
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
      console.warn("POD completed but StopId is missing in response/payload.", { payload, response });
      return;
    }

    setPodCompletedInfo({
      foId: effectiveFoId,
      stopId: effectiveStopId,
      event,
      ts: Date.now(),
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
        {/* Badge */}
        <div className="flex items-start mb-3">
          <span
            className="px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ backgroundColor: statusBg, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Route row */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>
              From
            </p>
            <p className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }} title={origin}>
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
            <p className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }} title={destination}>
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
            <span style={{ color: TEXT_SECONDARY }}>
              ETA {liveEtaText || eta}
              {nextStopCoords ? " (next stop)" : ""}
            </span>
          </div>
        </div>

        {/* Optional: small live tracking meta */}
        {liveMeta?.updatedAt && (
          <p className="text-[10px] mt-2" style={{ color: TEXT_SECONDARY, opacity: 0.8 }}>
            Live tracking: last update {new Date(liveMeta.updatedAt).toLocaleTimeString("en-GB")}{" "}
            {liveMeta.distanceKm != null
              ? `• ${liveMeta.distanceKm.toFixed(1)} km to ${nextStopCoords ? "next stop" : "destination"}`
              : ""}
          </p>
        )}
      </div>

      {/* TIMELINE SECTION */}
      <div className="mt-2">
        <RouteTimeline
          selectedShipment={selectedShipment}
          onAction={handleChildAction}
          podCompletedInfo={podCompletedInfo}
          delayReportedInfo={delayReportedInfo}
          liveStopEtas={liveStopEtas}
        />
      </div>

      {/* POD FLOW DIALOG */}
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
