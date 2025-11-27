import React, { useState } from "react";
import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";

const AlertsPage = () => (
  <div className="px-4 pt-6">
    <h2 style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}>
      Alerts (coming soon)
    </h2>
  </div>
);
const ProfilePage = () => (
  <div className="px-4 pt-6">
    <h2 style={{ color: "#071e54", fontSize: 18, fontWeight: 600 }}>
      Profile (coming soon)
    </h2>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState("home");

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return <ShipmentSearchPage />;
      case "track":
        return <ShipmentDetailsPage />;
      case "alerts":
        return <AlertsPage />;
      case "profile":
        return <ProfilePage />;
      default:
        return <ShipmentSearchPage />;
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#eff0f3" }}
    >
      {/* main content */}
      <div className="flex-1">{renderPage()}</div>

      {/* bottom bar visible on ALL pages */}
      <BottomBar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
