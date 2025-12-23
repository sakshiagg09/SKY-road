// src/tracking/DriverTrackingManager.jsx
import React, { useEffect, useCallback } from "react";
import { useBackgroundLocation } from "../hooks/useBackgroundLocation";
import { enqueue, drain } from "./locationQueue";

const BACKEND =
  "https://nav-it-consulting-gmbh-nav-payg-btp-3oqfixeo-dev-sky-ro70256e00.cfapps.us10-001.hana.ondemand.com";

export default function DriverTrackingManager({ authenticated, selectedShipment }) {
  // ✅ STOP everything until token exists
  const token = localStorage.getItem("access_token");
  if (!authenticated || !token) return null;

  const getContext = () => ({
    foId: selectedShipment?.FreightOrderId || selectedShipment?.FoId || "UNKNOWN_FO",
    driverId: "DRIVER_001", // TODO: derive from token later
  });

  const flushQueue = useCallback(async () => {
    const queue = drain();
    if (!queue.length) return;

    console.log("SKY: flushing queue:", queue.length);

    for (const point of queue) {
      try {
        await fetch(`${BACKEND}/api/tracking/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: JSON.stringify(point),
        });
      } catch (e) {
        enqueue(point); // requeue failed
        throw e;
      }
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      console.log("SKY: Network online → flushing queue");
      flushQueue();
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [flushQueue]);

  const handleLocation = useCallback(
    async (loc) => {
      // ✅ extra guard (in case token gets cleared later)
      const t = localStorage.getItem("access_token");
      if (!t) return;

      const { foId, driverId } = getContext();

      const payload = {
        FoId: foId,
        DriverId: driverId,
        Latitude: loc.latitude,
        Longitude: loc.longitude,
        Accuracy: loc.accuracy,
        Timestamp: loc.timestamp,
      };

      console.log("SKY: New location:", payload);

      enqueue(payload);

      try {
        await flushQueue();
      } catch (e) {
        console.log("SKY: failed to send, will retry later");
      }
    },
    [selectedShipment, flushQueue]
  );

  // ✅ only start native watcher AFTER auth
  useBackgroundLocation({ onLocation: handleLocation });

  return null;
}
