// src/App.jsx (or where your root component is)
import React, { useState } from "react";
import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);

  // report dialog control (global)
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned"); // or "planned"

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  const handleOpenReport = (mode = "unplanned") => {
    setReportMode(mode);
    setReportOpen(true);
  };

  const handleCloseReport = () => {
    setReportOpen(false);
  };

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return <ShipmentSearchPage setSelectedShipment={setSelectedShipment} setActiveTab={setActiveTab} />;
      case "track":
        return <ShipmentDetailsPage selectedShipment={selectedShipment} setActiveTab={setActiveTab} />;
      case "alerts":
        // you may want to keep alerts page but we still show dialog globally
        return (
          <div className="px-4 pt-6">
            <h2 style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}>Alerts (coming soon)</h2>
          </div>
        );
      case "profile":
        return (
          <div className="px-4 pt-6">
            <h2 style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}>Profile (coming soon)</h2>
          </div>
        );
      default:
        return <ShipmentSearchPage setSelectedShipment={setSelectedShipment} setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#eff0f3", height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: contentPaddingBottom }}>
        {renderPage()}
      </div>

      {/* BottomBar receives onReportClick so it can open the dialog */}
      <BottomBar activeTab={activeTab} setActiveTab={setActiveTab} onReportClick={() => handleOpenReport("unplanned")} />

      {/* Global Report dialog (controlled) — always mounted so it appears from any page */}
      <ReportEventDialog
        selectedShipment={selectedShipment}
        open={reportOpen}
        mode={reportMode}
        onClose={handleCloseReport}
      />
    </div>
  );
}
