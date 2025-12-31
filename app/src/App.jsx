// src/App.jsx
import { useState, useEffect, useCallback } from "react";

import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import BottomBar from "./components/BottomBar";
import ReportEventDialog from "./components/ReportEventDialog";
import DriverTrackingManager from "./tracking/DriverTrackingManager";
import { Capacitor } from "@capacitor/core";
import { loginPKCE, loadToken } from "./auth/auth";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);

  const [nextStop, setNextStop] = useState(null); // keep (no break)

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState("unplanned");

  const BAR_HEIGHT = 64;
  const contentPaddingBottom = BAR_HEIGHT + 70;

  useEffect(() => {
    console.log("AUTH: App mounted");

    (async () => {
      const isNative = Capacitor.isNativePlatform();
      const isLocalWeb =
        !isNative && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

      if (isLocalWeb) {
        console.warn("AUTH: Local web dev detected -> bypassing login");
        setAuthenticated(true);
        return;
      }

      const tokenObj = await loadToken();
      const token = tokenObj?.access_token || null;

      if (!token) await loginPKCE(() => setAuthenticated(true));
      else setAuthenticated(true);
    })().catch((e) => console.log("AUTH init error", e));
  }, []);

  const handleOpenReport = (mode = "unplanned") => {
    setReportMode(mode);
    setReportOpen(true);
  };

  const handleCloseReport = () => setReportOpen(false);

  // ==========================
  // ✅ FULL ROUTE MAP OPENING
  // ==========================

  const isFiniteNum = (v) => Number.isFinite(Number(v));
  const isZeroCoord = (lat, lng) => Number(lat) === 0 && Number(lng) === 0;

  const stopLatLng = (s) => {
    const lat = s?.Latitude ?? s?.latitude ?? s?.lat ?? null;
    const lng = s?.Longitude ?? s?.longitude ?? s?.lng ?? null;
    const ok = isFiniteNum(lat) && isFiniteNum(lng) && !isZeroCoord(lat, lng);
    return ok ? { lat: Number(lat), lng: Number(lng) } : null;
  };

  const stopLabel = (s) => {
    const parts = [
      s?.name || s?.name1 || s?.locId || s?.locid || s?.stopId || s?.stopid || "",
      s?.street || "",
      [s?.postCode1 || s?.postCode || "", s?.city1 || s?.city || ""].filter(Boolean).join(" "),
      s?.country || "",
    ].filter(Boolean);
    return parts.join(", ");
  };

  // Google Maps Directions API URL supports waypoints (max ~23)
  // We prefer coordinates; if missing, fall back to address label.
  const toMapsPoint = (s) => {
    const ll = stopLatLng(s);
    if (ll) return `${ll.lat},${ll.lng}`;
    const lbl = stopLabel(s);
    return lbl ? lbl : null;
  };

  // Sort stops in correct route order (same logic as your details page)
  const sortStops = (stops) => {
    if (!Array.isArray(stops)) return [];
    return [...stops].sort((a, b) => {
      const ta = new Date(a?.dateTime || a?.dateTimeString || a?.plannedDateTime || 0).getTime() || 0;
      const tb = new Date(b?.dateTime || b?.dateTimeString || b?.plannedDateTime || 0).getTime() || 0;
      return ta - tb;
    });
  };

  const openFullRouteInMaps = useCallback(() => {
    const shipment = selectedShipment;

    if (!shipment || !Array.isArray(shipment.stops) || shipment.stops.length < 2) {
      alert("Route not available yet. Please open a shipment with at least 2 stops.");
      return;
    }

    const sorted = sortStops(shipment.stops);

    // Convert to points (coords preferred)
    const points = sorted
      .map(toMapsPoint)
      .filter(Boolean);

    if (points.length < 2) {
      alert("Could not build a route: stops are missing coordinates/address.");
      return;
    }

    // origin = first, destination = last, waypoints = middle
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1);

    // Google Maps has a practical waypoints limit; keep safe
    const MAX_WAYPOINTS = 23;
    const trimmedWaypoints = waypoints.slice(0, MAX_WAYPOINTS);

    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      (trimmedWaypoints.length
        ? `&waypoints=${encodeURIComponent(trimmedWaypoints.join("|"))}`
        : "") +
      `&travelmode=driving`;

    window.location.href = url;
  }, [selectedShipment]);

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
            onAction={(action, payload) => {
              if (action === "nextStop") setNextStop(payload?.stop || null); // keep
              console.log("Timeline action:", action, payload);
            }}
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
      <DriverTrackingManager authenticated={authenticated} selectedShipment={selectedShipment} />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: contentPaddingBottom }}>
        {renderPage()}
      </div>

      <BottomBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReportClick={() => handleOpenReport("unplanned")}
        onMapClick={openFullRouteInMaps}   // ✅ now opens full route
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
