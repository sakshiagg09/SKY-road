// src/App.jsx
import { useState, useEffect } from "react";

import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";
import DriverTrackingManager from "./tracking/DriverTrackingManager";

import { loginPKCE } from "./auth/auth";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned");

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

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
      }).catch((e) => console.log("AUTH: loginPKCE error", String(e)));
    } else {
      setAuthenticated(true);
    }
  }, []);

  const handleOpenReport = (mode = "unplanned") => {
    setReportMode(mode);
    setReportOpen(true);
  };

  const handleCloseReport = () => setReportOpen(false);

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
            onAction={(action, payload) =>
              console.log("Timeline action:", action, payload)
            }
          />
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
      {/* ✅ Tracking starts only after auth */}
      <DriverTrackingManager
        authenticated={authenticated}
        selectedShipment={selectedShipment}
      />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: contentPaddingBottom }}>
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
