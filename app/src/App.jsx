// src/App.jsx
import React, { useState, useEffect } from "react";
import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";
import DriverTrackingManager from "./tracking/DriverTrackingManager";

import { Capacitor } from "@capacitor/core";
import { getAccessToken, startPkceLogin, initPkceRedirectListener } from "./lib/http";

export default function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // ✅ must be registered so deep link callback works
    initPkceRedirectListener();

    (async () => {
      const token = await getAccessToken();
      if (token) return;

      try {
        await startPkceLogin();
      } catch (e) {
        console.error("Failed to start PKCE login", e);
      }
    })();
  }, []);

  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned");

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  const handleOpenReport = (mode = "unplanned") => {
    setReportMode(mode);
    setReportOpen(true);
  };

  const handleCloseReport = () => setReportOpen(false);

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return <ShipmentSearchPage setSelectedShipment={setSelectedShipment} setActiveTab={setActiveTab} />;
      case "track":
        return <ShipmentDetailsPage selectedShipment={selectedShipment} onAction={() => {}} />;
      default:
        return <ShipmentSearchPage setSelectedShipment={setSelectedShipment} setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#eff0f3", height: "100vh", display: "flex", flexDirection: "column" }}>
      <DriverTrackingManager selectedShipment={selectedShipment} />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: contentPaddingBottom }}>
        {renderPage()}
      </div>

      <BottomBar activeTab={activeTab} setActiveTab={setActiveTab} onReportClick={() => handleOpenReport("unplanned")} />

      <ReportEventDialog selectedShipment={selectedShipment} open={reportOpen} mode={reportMode} onClose={handleCloseReport} />
    </div>
  );
}
