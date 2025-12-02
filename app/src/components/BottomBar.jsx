import React from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";

const BAR_HEIGHT = 64; // unchanged

export default function BottomBar({ activeTab, setActiveTab }) {
  return (
    <div>
      {/* FIXED BOTTOM BAR */}
      <div
        style={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: `calc(32px + env(safe-area-inset-bottom))`,
          height: BAR_HEIGHT,
          borderRadius: 9999,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 32,
          paddingRight: 32,
          backgroundColor: "rgba(255,255,255,0.98)",
          boxShadow:
            "8px 8px 16px rgba(217,220,225,1), -8px -8px 16px rgba(255,255,255,1)",
          color: "#6b6c6e",
          fontSize: 12,
          backdropFilter: "blur(6px)",
          position: "fixed",
        }}
      >
        {/* HOME */}
        <button
          className="flex flex-col items-center"
          style={{
            color: activeTab === "home" ? "#1976D2" : "#6b6c6e",
            width: "33%",
          }}
          onClick={() => setActiveTab("home")}
        >
          <HomeOutlinedIcon sx={{ fontSize: 20 }} />
          <span style={{ fontSize: 11, marginTop: 2 }}>Home</span>
        </button>

        {/* MIDDLE COLUMN (Map + Copyright stacked) */}
        <div
          style={{
            width: "33%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 12, // slight optical adjustment
          }}
        >
          <button
            className="flex flex-col items-center"
            style={{ color: activeTab === "track" ? "#1976D2" : "#6b6c6e" }}
            onClick={() => setActiveTab("track")}
          >
            <MapOutlinedIcon sx={{ fontSize: 20 }} />
            <span style={{ fontSize: 11, marginTop: 2 }}>Map</span>
          </button>

          {/* COPYRIGHT INSIDE BAR, BELOW MAP */}
          <span
            style={{
              fontSize: 10,
              color: "#9aa0ab",
              marginTop: 0,
              whiteSpace: "nowrap",
            }}
          >
            © NAV IT Consulting
          </span>
        </div>

        {/* REPORT */}
        <button
          className="flex flex-col items-center"
          style={{
            color: activeTab === "alerts" ? "#1976D2" : "#6b6c6e",
            width: "33%",
          }}
          onClick={() => setActiveTab("alerts")}
        >
          <SummarizeOutlinedIcon sx={{ fontSize: 20 }} />
          <span style={{ fontSize: 11, marginTop: 2 }}>Report</span>
        </button>
      </div>
    </div>
  );
}
