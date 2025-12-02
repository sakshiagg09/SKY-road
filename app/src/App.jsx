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
  // selectedShipment will hold the parsed trackingDetails / FinalInfo
  const [selectedShipment, setSelectedShipment] = useState(null);

  // keep BAR_HEIGHT in sync if you change BottomBar
  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        // pass setters so search page can set selected shipment & switch tab
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
            setActiveTab={setActiveTab}
          />
        );
      case "alerts":
        return <AlertsPage />;
      case "profile":
        return <ProfilePage />;
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
      style={{ backgroundColor: "#eff0f3", height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: contentPaddingBottom,
        }}
      >
        {renderPage()}
      </div>

      <BottomBar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
