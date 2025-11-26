import React, { useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import LocalActivityOutlinedIcon from "@mui/icons-material/LocalActivityOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";

export default function ShipmentSearchPage() {
  const [trackingInput, setTrackingInput] = useState("");

  const recent = [
    {
      id: "E9436QX",
      status: "Package processing",
      date: "09/12",
      color: "bg-slate-700",
      icon: <LocalActivityOutlinedIcon fontSize="small" />,
    },
    {
      id: "F1674WQ",
      status: "On the way",
      date: "03/12",
      time: "2:37 AM",
      color: "bg-blue-500",
      icon: <LocalShippingOutlinedIcon fontSize="small" />,
    },
    {
      id: "T7952YU",
      status: "Shipped",
      date: "29/11",
      time: "1:04 AM",
      color: "bg-amber-400",
      icon: <LocalMallOutlinedIcon fontSize="small" />,
    },
    {
      id: "Q0309AG",
      status: "Completed",
      date: "27/10",
      time: "1:48 AM",
      color: "bg-emerald-500",
      icon: <CheckCircleOutlineOutlinedIcon fontSize="small" />,
    },
  ];

  const handleSearch = () => {
    console.log("Search for:", trackingInput);
    // TODO: call CAP service here
  };

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400 text-center">
          Sky Road Tracking App
        </p>
        <h1 className="mt-2 text-xl font-semibold text-center">
          Shipment Search
        </h1>
      </div>

      {/* SEARCH BAR */}
      <div className="flex items-center bg-[#101623] rounded-full px-4 py-2 shadow-sm mb-4">
        <SearchRoundedIcon className="text-slate-400 mr-2" fontSize="small" />
        <input
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-500"
          placeholder="Track your package"
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1f2937] text-slate-200">
          <TuneRoundedIcon sx={{ fontSize: 18 }} />
        </button>
      </div>

      {/* RECENT LIST */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-slate-200">Recent</p>
          <button className="text-xs text-slate-400">See all ▸</button>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          Last updated 4h ago
        </p>

        <div className="space-y-2 flex-1">
          {recent.map((s) => (
            <button
              key={s.id}
              className="w-full flex items-center justify-between rounded-2xl bg-[#0b101b] px-3 py-2.5 border border-[#1f2937] text-left"
              onClick={() => console.log("Open shipment:", s.id)}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center ${s.color}`}
                >
                  {s.icon}
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-slate-50 tracking-wide">
                    {s.id}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {s.status}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end text-[11px] text-slate-400">
                <span>{s.date}</span>
                {s.time && <span className="opacity-70">{s.time}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* BOTTOM NAV */}
        <div className="mt-4">
          <div className="rounded-full bg-[#050814] border border-[#1f2937] px-8 py-3 flex items-center justify-between text-slate-400 text-xs">
            <div className="flex flex-col items-center gap-1 text-slate-100">
              <HomeOutlinedIcon sx={{ fontSize: 20 }} />
              <span>Home</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <LocalShippingOutlinedIcon sx={{ fontSize: 20 }} />
              <span>Track</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <NotificationsNoneOutlinedIcon sx={{ fontSize: 20 }} />
              <span>Alerts</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <PersonOutlineOutlinedIcon sx={{ fontSize: 20 }} />
              <span>Profile</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
