// src/App.jsx
import { useState, useEffect } from "react";

import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";
import DriverTrackingManager from "./tracking/DriverTrackingManager";

// 🔐 PKCE login
import { loginPKCE } from "./auth/auth";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);

  const [authenticated, setAuthenticated] = useState(false);

  // Report Event dialog control (global)
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned");

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  // 🔐 AUTH BOOTSTRAP (RUNS ONCE)
  useEffect(() => {
  console.log("AUTH: App mounted");

  const token = localStorage.getItem("access_token");
  console.log("AUTH: Existing token =", token);

  if (!token) {
    console.log("AUTH: No token, starting PKCE login");
    loginPKCE(({ access_token }) => {
      console.log("AUTH: Token received");
      localStorage.setItem("access_token", access_token);
      setAuthenticated(true);
    });
  } else {
    setAuthenticated(true);
  }
}, []);


  const handleOpenReport = (mode = "unplanned") => {
    setReportMode(mode);
    setReportOpen(true);
  };

  const handleCloseReport = () => {
    setReportOpen(false);
  };

  const handleTimelineAction = (action, payload) => {
    console.log("Timeline action:", action, payload);
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
            <h2 style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}>
              Alerts (coming soon)
            </h2>
          </div>
        );

      case "profile":
        return (
          <div className="px-4 pt-6">
            <h2 style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}>
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

  // ⛔ Block UI until login completes
  if (!authenticated) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        Signing you in…
      </div>
    );
  }

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
      {/* 🚚 Background tracking (safe after auth) */}
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

      <BottomBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReportClick={() => handleOpenReport("unplanned")}
      />

      <ReportEventDialog
        selectedShipment={selectedShipment}
        open={reportOpen}
        mode={reportMode}
        onClose={handleCloseReport}
      />
    </div>
  );
}
