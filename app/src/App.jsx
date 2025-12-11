// src/App.jsx
import React, { useState } from "react";
import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";

// ⭐ NEW import
import DriverTrackingManager from "./tracking/DriverTrackingManager";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);

  // Report Event dialog control (global)
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

  // This receives actions from ShipmentDetailsPage/RouteTimeline
  // (items, arrival, departure, pod, progress, …)
  const handleTimelineAction = (action, payload) => {
    console.log("Timeline action:", action, payload);
    // POD flow is now fully handled inside ShipmentDetailsPage (PodFlowDialog there)
  };

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return (
          <ShipmentSearchPage
            setSelectedShipment={setSelectedShipment}
            setActiveTab={setActiveTab}
          />
        );

      case "track":
        return (
          <ShipmentDetailsPage
            selectedShipment={selectedShipment}
            onAction={handleTimelineAction}
          />
        );

      case "alerts":
        return (
          <div className="px-4 pt-6">
            <h2
              style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}
            >
              Alerts (coming soon)
            </h2>
          </div>
        );

      case "profile":
        return (
          <div className="px-4 pt-6">
            <h2
              style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}
            >
              Profile (coming soon)
            </h2>
          </div>
        );

      default:
        return (
          <ShipmentSearchPage
            setSelectedShipment={setSelectedShipment}
            setActiveTab={setActiveTab}
          />
        );
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#eff0f3",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ⭐ Tracking manager runs in background, safe & invisible */}
      <DriverTrackingManager selectedShipment={selectedShipment} />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: contentPaddingBottom,
        }}
      >
        {renderPage()}
      </div>

      {/* BottomBar can always open ReportEvent dialog */}
      <BottomBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReportClick={() => handleOpenReport("unplanned")}
      />

      {/* Global Report Event dialog */}
      <ReportEventDialog
        selectedShipment={selectedShipment}
        open={reportOpen}
        mode={reportMode}
        onClose={handleCloseReport}
      />
    </div>
  );
}
