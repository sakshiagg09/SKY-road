// src/tracking/DriverTrackingManager.jsx
import React, { useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { useBackgroundLocation } from "../hooks/useBackgroundLocation";
import { enqueue, drain } from "./locationQueue";
import { apiUrl } from "../lib/apiBase";
import { httpJson, getAccessToken } from "../lib/http";

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
        // Do not attempt network calls until authenticated on native.
        // (Token is populated by the PKCE flow and auto-attached by httpJson.)
        const token = await getAccessToken();
        if (Capacitor.isNativePlatform() && !token) {
          console.log("SKY: not authenticated yet; queue kept");
          return; // ✅ don't drain, keep queue intact
        }

        const queue = drain();
        if (!queue.length) return;

        const url = apiUrl("/api/tracking/location");
        await httpJson(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: point,
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
        if (String(e?.message || "").includes("NOT_AUTHENTICATED")) {
          console.log("SKY: not authenticated yet; location queued");
        } else {
          console.log("SKY: offline or backend unreachable; will retry later");
        }
      }
    },
    [selectedShipment]
  );

  // ALWAYS run tracking  
  useBackgroundLocation({ onLocation: handleLocation });

  return null; // No UI needed
}
