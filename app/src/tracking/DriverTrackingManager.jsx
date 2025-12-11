// src/tracking/DriverTrackingManager.jsx
import React, { useEffect, useCallback } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useBackgroundLocation } from "../hooks/useBackgroundLocation";
import { enqueue, drain } from "./locationQueue";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

export default function DriverTrackingManager({ selectedShipment }) {

  const getContext = () => ({
    foId: selectedShipment?.FreightOrderId || selectedShipment?.FoId || "UNKNOWN_FO",
    driverId: "DRIVER_001", // TODO: Pull from login
  });

  // 🌐 Send queue when network returns
  const flushQueue = useCallback(async () => {
    const queue = drain();
    if (!queue.length) return;

    console.log("SKY: flushing queue:", queue.length);

    for (const point of queue) {
      try {
        await fetch("/api/tracking/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(point),
        });
      } catch (e) {
        enqueue(point); // requeue failed
        throw e;
      }
    }
  }, []);

  // Listen for network restoration
  useEffect(() => {
    const handler = () => {
      console.log("SKY: Network online → flushing queue");
      flushQueue();
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, []);

  // GPS Callback (ALWAYS running)
  const handleLocation = useCallback(
    async (loc) => {
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

      enqueue(payload); // store

      try {
        await flushQueue();
      } catch (e) {
        console.log("SKY: offline, will retry later");
      }
    },
    [selectedShipment]
  );

  // ALWAYS run tracking  
  useBackgroundLocation({ onLocation: handleLocation });

  return null; // No UI needed
}
