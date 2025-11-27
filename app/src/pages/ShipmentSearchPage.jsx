import React, { useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import LocalActivityOutlinedIcon from "@mui/icons-material/LocalActivityOutlined";

export default function ShipmentSearchPage() {
  const [trackingInput, setTrackingInput] = useState("");

  const recent = [
    {
      id: "E9436QX",
      status: "Package processing",
      date: "09/12",
      color: "#1976D2",
      icon: <LocalActivityOutlinedIcon fontSize="small" />,
    },
    {
      id: "F1674WQ",
      status: "On the way",
      date: "03/12",
      time: "2:37 AM",
      color: "#1976D2",
      icon: <LocalShippingOutlinedIcon fontSize="small" />,
    },
    {
      id: "T7952YU",
      status: "Shipped",
      date: "29/11",
      time: "1:04 AM",
      color: "#FFC107",
      icon: <LocalMallOutlinedIcon fontSize="small" />,
    },
    {
      id: "Q0309AG",
      status: "Completed",
      date: "27/10",
      time: "1:48 AM",
      color: "#2E7D32",
      icon: <CheckCircleOutlineOutlinedIcon fontSize="small" />,
    },
  ];

  return (
    <div className="w-full">
      {/* HEADER */}
      <div className="text-center mt-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
          Sky Road Tracking App
        </p>

        <h1
          className="font-semibold"
          style={{ fontSize: "20px", color: "#071e54", marginTop: "4px" }}
        >
          Shipment Search
        </h1>
      </div>

      {/* SEARCH BAR */}
      <div className="px-4 mt-5">
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
            style={{
              color: "#071e54",
              fontSize: "14px",
            }}
            placeholder="Track your package"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
          />

          <button
            className="h-9 w-9 flex items-center justify-center rounded-full"
            style={{
              backgroundColor: "#eff0f3",
              boxShadow:
                "inset 3px 3px 6px #d9dce1, inset -3px -3px 6px #ffffff",
            }}
          >
            <TuneRoundedIcon sx={{ color: "#1976D2", fontSize: 18 }} />
          </button>
        </div>
      </div>

      {/* RECENT SECTION */}
      <div className="px-4 mt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <p
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#071e54",
            }}
          >
            Recent
          </p>
          <button
            style={{
              fontSize: "12px",
              color: "#1976D2",
              fontWeight: 500,
            }}
          >
            See all ▸
          </button>
        </div>

        <p style={{ fontSize: "10px", color: "#6b6c6e" }}>
          Last updated 4h ago
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
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: s.color, color: "white" }}
                >
                  {s.icon}
                </div>

                <div>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#071e54",
                    }}
                  >
                    {s.id}
                  </p>
                  <p style={{ fontSize: "12px", color: "#6b6c6e" }}>
                    {s.status}
                  </p>
                </div>
              </div>

              <div
                className="text-right"
                style={{ fontSize: "12px", color: "#6b6c6e" }}
              >
                {s.date}
                {s.time && <div className="opacity-70">{s.time}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
