import React from "react";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import TimelineIcon from "@mui/icons-material/Timeline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import ScaleOutlinedIcon from "@mui/icons-material/ScaleOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

export default function ShipmentDetailsPage() {
  const shipmentNo = "6300002994";
  const status = "On the way";
  const eta = "Today, 18:45";
  const origin = "Bonn DC, Germany";
  const destination = "Hamburg Hub, Germany";

  const stops = [
    {
      id: "SP_1000",
      label: "Planned Departure",
      datetime: "19/11/2025, 09:15 CET",
      address: "2nd street, 53121 Bonn, North Rhine-Westphalia, Germany",
      badge: "Loaded",
      color: "#1976D2",
      done: true,
    },
    {
      id: "BP_NAV",
      label: "Planned Arrival",
      datetime: "19/11/2025, 18:45 CET",
      address: "41 Theodor-Litt-Straße, 20457 Hamburg, Germany",
      badge: "ETA",
      color: "#FB8C00",
      done: false,
    },
  ];

  const BG = "#EFF0F3";
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  return (
    <div
      className="min-h-screen w-full px-4 pt-4 pb-2"
      style={{ backgroundColor: BG, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* TITLE */}
      <div className="mb-3">
        <p
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: TEXT_SECONDARY }}
        >
          Shipment overview
        </p>
        <h2
          className="font-semibold"
          style={{ fontSize: 20, color: TEXT_PRIMARY, marginTop: 4 }}
        >
          Shipment #{shipmentNo}
        </h2>
      </div>

      {/* HERO CARD */}
      <div
        className="rounded-3xl p-4 mb-5"
        style={{
          background:
            "linear-gradient(135deg, #ffffff 0%, #f3f6ff 40%, #e0ebff 100%)",
          boxShadow: "10px 10px 20px #d7dae2, -10px -10px 20px #ffffff",
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p
              className="text-xs font-medium mb-1"
              style={{ color: TEXT_SECONDARY }}
            >
              Current status
            </p>
            <p
              className="font-semibold"
              style={{ fontSize: 16, color: TEXT_PRIMARY }}
            >
              {status}
            </p>
          </div>

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
          <div className="flex-1">
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>
              From
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: TEXT_PRIMARY }}
            >
              {origin}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <TimelineIcon sx={{ fontSize: 20, color: PRIMARY }} />
            <div className="w-px h-4 bg-gradient-to-b from-blue-500 to-transparent opacity-40" />
          </div>

          <div className="flex-1 text-right">
            <p className="text-[11px]" style={{ color: TEXT_SECONDARY }}>
              To
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: TEXT_PRIMARY }}
            >
              {destination}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 mb-3">
          <div className="flex justify-between text-[10px] mb-1">
            <span style={{ color: TEXT_SECONDARY }}>Progress</span>
            <span style={{ color: TEXT_SECONDARY }}>70%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#d9e2f2] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: "70%",
                background:
                  "linear-gradient(90deg, #1976D2 0%, #42A5F5 60%, #90CAF9 100%)",
              }}
            ></div>
          </div>
        </div>

        {/* KPI row */}
        <div className="flex items-center justify-between mt-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <RouteOutlinedIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>780 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ScaleOutlinedIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>12.4 t</span>
          </div>
          <div className="flex items-center gap-1.5">
            <LocalMallOutlinedIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>24 packages</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AccessTimeIcon sx={{ fontSize: 16, color: PRIMARY }} />
            <span style={{ color: TEXT_SECONDARY }}>ETA {eta}</span>
          </div>
        </div>
      </div>

      {/* TIMELINE HEADER */}
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-sm font-semibold"
          style={{ color: TEXT_PRIMARY }}
        >
          Route timeline
        </p>
        <p className="text-[11px]" style={{ color: PRIMARY }}>
          View on map ▸
        </p>
      </div>

      {/* TIMELINE LIST */}
      <div className="mt-2">
        {stops.map((stop, idx) => (
          <div key={stop.id} className="flex items-stretch mb-4">
            {/* line + dot */}
            <div className="flex flex-col items-center mr-3">
              <div
                className="h-4 w-4 rounded-full border-2 flex items-center justify-center"
                style={{
                  borderColor: stop.color,
                  backgroundColor: stop.done ? stop.color : "#FFFFFF",
                }}
              >
                {stop.done && (
                  <CheckCircleOutlineIcon
                    sx={{ fontSize: 14, color: "#FFFFFF" }}
                  />
                )}
              </div>
              {idx !== stops.length - 1 && (
                <div className="flex-1 w-[2px] bg-gradient-to-b from-[#c7cfdd] to-transparent mt-1" />
              )}
            </div>

            {/* card */}
            <div
              className="flex-1 rounded-2xl p-4 border"
              style={{
                backgroundColor: CARD,
                borderColor: "#dde3ec",
                boxShadow: "4px 4px 14px #d9dde6, -4px -4px 14px #ffffff",
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${stop.color}15`,
                    }}
                  >
                    {idx === 0 ? (
                      <LocalShippingIcon
                        sx={{ fontSize: 20, color: stop.color }}
                      />
                    ) : (
                      <LocationOnIcon
                        sx={{ fontSize: 20, color: stop.color }}
                      />
                    )}
                  </div>

                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: TEXT_PRIMARY }}
                    >
                      {stop.label}
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: TEXT_SECONDARY }}
                    >
                      {stop.id}
                    </p>
                  </div>
                </div>

                <span
                  className="px-2 py-1 rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: `${stop.color}10`,
                    color: stop.color,
                  }}
                >
                  {stop.badge}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] mb-1">
                <AccessTimeIcon
                  sx={{ fontSize: 14, color: TEXT_SECONDARY }}
                />
                <span style={{ color: TEXT_SECONDARY }}>{stop.datetime}</span>
              </div>

              <p
                className="mt-1 text-[11px] leading-snug"
                style={{ color: TEXT_SECONDARY }}
              >
                {stop.address}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
