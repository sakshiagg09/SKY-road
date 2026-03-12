// src/components/BottomBar.jsx
import React, { useState } from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import MicIcon from "@mui/icons-material/Mic";
import { Menu, MenuItem } from "@mui/material";

const BAR_HEIGHT = 64;

export default function BottomBar({
  activeTab,
  setActiveTab,
  onReportClick,
  onMapClick,
  onAttachmentsClick,
  onVoiceClick,
  voiceEnabled = false,
  hasShipment = false,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);

  const tabColor = (tab) => (activeTab === tab ? "#1976D2" : "#6b6c6e");

  const handleReportMenuOpen = (e) => {
    if (typeof onReportClick !== "function") {
      setActiveTab("alerts");
      return;
    }
    setAnchorEl(e.currentTarget);
  };

  const handleReportMenuClose = () => setAnchorEl(null);

  const handleChooseReport = (mode) => {
    handleReportMenuClose();
    onReportClick?.(mode);
  };

  const handleMap = () => {
    if (typeof onMapClick === "function") return onMapClick();
    setActiveTab("track");
  };

  const handleAttachments = () => {
    if (!hasShipment) {
      alert("Please search and open a Freight Order first.");
      return;
    }
    if (typeof onAttachmentsClick === "function") return onAttachmentsClick();
    setActiveTab("attachments");
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
          backgroundColor: "rgba(255,255,255,0.98)",
          boxShadow:
            "8px 8px 16px rgba(217,220,225,1), -8px -8px 16px rgba(255,255,255,1)",
          backdropFilter: "blur(6px)",

          // ✅ make it a positioning context for the centered footer text
          position: "fixed",
          overflow: "hidden",
        }}
      >
        {/* 5 tabs grid */}
        <div
          style={{
            height: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            alignItems: "center",
            paddingLeft: 6,
            paddingRight: 6,
          }}
        >
          {/* HOME */}
          <button
            className="flex flex-col items-center"
            style={{
              color: tabColor("home"),
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
            onClick={() => setActiveTab("home")}
          >
            <HomeOutlinedIcon sx={{ fontSize: 20 }} />
            <span style={{ fontSize: 11, marginTop: 2 }}>Home</span>
          </button>

          {/* MAP */}
          <button
            className="flex flex-col items-center"
            style={{
              color: tabColor("track"),
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
            onClick={handleMap}
          >
            <MapOutlinedIcon sx={{ fontSize: 20 }} />
            <span style={{ fontSize: 11, marginTop: 2 }}>Map</span>
          </button>

          {/* ATTACHMENTS */}
          <button
            className="flex flex-col items-center"
            style={{
              color: tabColor("attachments"),
              opacity: hasShipment ? 1 : 0.45,
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
            onClick={handleAttachments}
          >
            <AttachFileOutlinedIcon sx={{ fontSize: 20 }} />
            <span style={{ fontSize: 11, marginTop: 2 }}>Attachments</span>
          </button>

          {/* VOICE — enabled only on details page with shipment loaded */}
          <button
            className="flex flex-col items-center"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              opacity: voiceEnabled ? 1 : 0.35,
              cursor: voiceEnabled ? "pointer" : "default",
            }}
            onClick={voiceEnabled && typeof onVoiceClick === "function" ? onVoiceClick : undefined}
          >
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: voiceEnabled
                ? "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)"
                : "#c0c4cc",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: voiceEnabled ? "0 3px 8px rgba(25,118,210,0.35)" : "none",
              marginBottom: 2,
            }}>
              <MicIcon sx={{ fontSize: 16, color: "#fff" }} />
            </div>
            <span style={{ fontSize: 11, color: voiceEnabled ? "#1976D2" : "#6b6c6e", fontWeight: voiceEnabled ? 600 : 400 }}>Voice</span>
          </button>

          {/* REPORT */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              className="flex flex-col items-center"
              style={{
                color: tabColor("alerts"),
                background: "transparent",
                border: "none",
                outline: "none",
                padding: 0,
              }}
              onClick={handleReportMenuOpen}
            >
              <SummarizeOutlinedIcon sx={{ fontSize: 20 }} />
              <span style={{ fontSize: 11, marginTop: 2 }}>Report</span>
            </button>

            <Menu
              anchorEl={anchorEl}
              open={menuOpen}
              onClose={handleReportMenuClose}
            >
              <MenuItem onClick={() => handleChooseReport("unplanned")}>
                Unplanned Event
              </MenuItem>
            </Menu>
          </div>
        </div>

        {/* ✅ Company footer: ALWAYS centered, independent of tabs */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 6,
            fontSize: 9,
            color: "#9aa0ab",
            lineHeight: "2px",
            whiteSpace: "nowrap",
            pointerEvents: "none", // ✅ doesn't block clicks
            width: "max-content",
            textAlign: "center",
          }}
        >
          © NAV IT Consulting
        </div>
      </div>
    </div>
  );
}
