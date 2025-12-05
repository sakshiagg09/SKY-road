import React, { useState, useCallback } from "react";
import TimelineIcon from "@mui/icons-material/Timeline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import ScaleOutlinedIcon from "@mui/icons-material/ScaleOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";

import RouteTimeline from "./RouteTimeline";

/**
 * Props:
 *  - selectedShipment
 *  - onAction?: (action: string, payload: any) => void
 */
export default function ShipmentDetailsPage({ selectedShipment, onAction }) {
  const BG = "#EFF0F3";
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  // progress stored here — RouteTimeline will update via onAction("progress", percent)
  const [progress, setProgress] = useState(60);

  if (!selectedShipment) {
    return (
      <div
        className="min-h-screen w-full px-4 pt-6 pb-24"
        style={{ backgroundColor: BG, fontFamily: "Inter, system-ui, sans-serif" }}
      >
        <h2 style={{ color: TEXT_PRIMARY, fontSize: 18, fontWeight: 600 }}>No shipment selected</h2>
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
    ? `${firstStop.name || firstStop.name1 || firstStop.locId || firstStop.locid || ""}${firstStop.city ? `, ${firstStop.city}` : ""}${firstStop.country ? `, ${firstStop.country}` : ""}`
    : "-";
  const destination = lastStop
    ? `${lastStop.name || lastStop.name1 || lastStop.locId || lastStop.locid || ""}${lastStop.city ? `, ${lastStop.city}` : ""}${lastStop.country ? `, ${lastStop.country}` : ""}`
    : "-";
  const eta = lastStop ? new Date(lastStop.dateTime || lastStop.dateTimeString || lastStop.plannedDateTime).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" }) : "-";

  // Handler to receive callbacks from RouteTimeline
  const handleChildAction = useCallback(
    (action, payload) => {
      if (action === "progress" && typeof payload === "number") {
        setProgress(payload);
      }
      if (typeof onAction === "function") onAction(action, payload);
    },
    [onAction]
  );

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
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>From</p>
            <p className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }} title={origin}>{origin}</p>
          </div>

          <div className="flex flex-col items-center">
            <TimelineIcon sx={{ fontSize: 20, color: PRIMARY }} />
            <div style={{ width: 1, height: 24, background: "linear-gradient(to bottom, rgba(25,118,210,0.3), transparent)" }} />
          </div>

          <div className="flex-1 text-right min-w-0">
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>To</p>
            <p className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }} title={destination}>{destination}</p>
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
            <span style={{ color: TEXT_SECONDARY }}>{stopsCount > 1 ? `${Math.max(0, stopsCount - 1)} legs` : "1 leg"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ScaleOutlinedIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>{raw?.TotalWeight || "—"} t</span>
          </div>
          <div className="flex items-center gap-1.5">
            <LocalMallOutlinedIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>{raw?.TotalPackages || "—"} packages</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AccessTimeIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>ETA {eta}</span>
          </div>
        </div>
      </div>

      {/* TIMELINE SECTION */}
      <div className="mt-2">
        <RouteTimeline
          selectedShipment={selectedShipment}
          onAction={handleChildAction}
        />
      </div>
    </div>
  );
}
