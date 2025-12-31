// src/components/BottomBar.jsx
import React, { useState } from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { Menu, MenuItem, IconButton } from "@mui/material";

const BAR_HEIGHT = 64;

export default function BottomBar({ activeTab, setActiveTab, onReportClick }) {
  // optional: small menu on Report to choose planned vs unplanned
  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);

  const handleReportMenuOpen = (e) => {
    if (typeof onReportClick !== "function") {
      // fallback behaviour: route to alerts
      setActiveTab("alerts");
      return;
    }
    // open a small menu so user can choose planned or unplanned
    setAnchorEl(e.currentTarget);
  };

  const handleReportMenuClose = () => setAnchorEl(null);

  const handleChooseReport = (mode) => {
    handleReportMenuClose();
    onReportClick(mode); // e.g. "planned" or "unplanned"
  };

  return (
    <div>
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
          boxShadow: "8px 8px 16px rgba(217,220,225,1), -8px -8px 16px rgba(255,255,255,1)",
          color: "#6b6c6e",
          fontSize: 12,
          backdropFilter: "blur(6px)",
        }}
      >
        <button
          className="flex flex-col items-center"
          style={{ color: activeTab === "home" ? "#1976D2" : "#6b6c6e", width: "33%" }}
          onClick={() => setActiveTab("home")}
        >
          <HomeOutlinedIcon sx={{ fontSize: 20 }} />
          <span style={{ fontSize: 11, marginTop: 2 }}>Home</span>
        </button>

        <div style={{ width: "33%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: 12 }}>
          <button
            className="flex flex-col items-center"
            style={{ color: activeTab === "track" ? "#1976D2" : "#6b6c6e" }}
            onClick={() => setActiveTab("track")}
          >
            <MapOutlinedIcon sx={{ fontSize: 20 }} />
            <span style={{ fontSize: 11, marginTop: 2 }}>Map</span>
          </button>

          <span style={{ fontSize: 10, color: "#9aa0ab", marginTop: 0, whiteSpace: "nowrap" }}>© NAV IT Consulting</span>
        </div>

        {/* REPORT - opens small menu to choose planned/unplanned (calls onReportClick(mode)) */}
        <div style={{ width: "33%", display: "flex", justifyContent: "center" }}>
          <button
            className="flex flex-col items-center"
            style={{ color: activeTab === "alerts" ? "#1976D2" : "#6b6c6e", width: "100%" }}
            onClick={handleReportMenuOpen}
          >
            <SummarizeOutlinedIcon sx={{ fontSize: 20 }} />
            <span style={{ fontSize: 11, marginTop: 2 }}>Report</span>
          </button>

          <Menu anchorEl={anchorEl} open={menuOpen} onClose={handleReportMenuClose}>
            <MenuItem onClick={() => handleChooseReport("unplanned")}> Unplanned Event</MenuItem>
          </Menu>
        </div>
      </div>
    </div>
  );
}
