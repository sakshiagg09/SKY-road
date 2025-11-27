import React from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";

export default function BottomBar({ activeTab, setActiveTab }) {
  return (
    <div className="px-4 pb-6 pt-3">
      <div
        className="rounded-full px-10 py-3 flex items-center justify-between"
        style={{
          backgroundColor: "#ffffff",
          boxShadow: "8px 8px 16px #d9dce1, -8px -8px 16px #ffffff",
          color: "#6b6c6e",
          fontSize: "12px",
        }}
      >
        {/* HOME */}
        <button
          className="flex flex-col items-center"
          style={{ color: activeTab === "home" ? "#1976D2" : "#6b6c6e" }}
          onClick={() => setActiveTab("home")}
        >
          <HomeOutlinedIcon sx={{ fontSize: 20 }} />
          <span>Home</span>
        </button>

        {/* TRACK */}
        <button
          className="flex flex-col items-center"
          style={{ color: activeTab === "track" ? "#1976D2" : "#6b6c6e" }}
          onClick={() => setActiveTab("track")}
        >
          <LocalShippingOutlinedIcon sx={{ fontSize: 20 }} />
          <span>Track</span>
        </button>

        {/* ALERTS */}
        <button
          className="flex flex-col items-center"
          style={{ color: activeTab === "alerts" ? "#1976D2" : "#6b6c6e" }}
          onClick={() => setActiveTab("alerts")}
        >
          <NotificationsNoneOutlinedIcon sx={{ fontSize: 20 }} />
          <span>Alerts</span>
        </button>

        {/* PROFILE */}
        <button
          className="flex flex-col items-center"
          style={{ color: activeTab === "profile" ? "#1976D2" : "#6b6c6e" }}
          onClick={() => setActiveTab("profile")}
        >
          <PersonOutlineOutlinedIcon sx={{ fontSize: 20 }} />
          <span>Profile</span>
        </button>
      </div>

      <div className="mt-2 text-center text-[11px] text-gray-500">
        © NAV IT Consulting
      </div>
    </div>
  );
}
