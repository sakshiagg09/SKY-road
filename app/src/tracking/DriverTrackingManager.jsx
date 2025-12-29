// src/tracking/DriverTrackingManager.jsx
import React, { useEffect, useCallback } from "react";
import { useBackgroundLocation } from "../hooks/useBackgroundLocation";
import { enqueue, peek, markSent } from "./locationQueue";
import { apiPost } from "../auth/api";

export default function DriverTrackingManager({ authenticated, selectedShipment }) {
  if (!authenticated) return null;

  const getContext = () => ({
    FoId: selectedShipment?.FoId || selectedShipment?.FreightOrderId || "UNKNOWN_FO",
    DriverId: "DRIVER_001",
  });

  const flushQueue = useCallback(async () => {
    const batch = peek(20);
    if (!batch.length) return;

    for (const point of batch) {
      try {
        // ✅ This uses your resolveUrl():
        // Native -> SRV + /api/tracking/location (with Bearer token)
        // Web    -> /api/tracking/location (relative)
        await apiPost("/api/tracking/location", point);

        markSent(point._id);
      } catch (e) {
        // stop; keep the remaining queued
        console.log("SKY: location POST failed, will retry later:", e?.message || e);
        break;
      }
    }
  }, []);

  useEffect(() => {
    const handler = () => flushQueue();
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [flushQueue]);

  const handleLocation = useCallback(
    async (loc) => {
      const { FoId, DriverId } = getContext();

      const payload = {
        FoId,
        DriverId,
        Latitude: loc.latitude,
        Longitude: loc.longitude,
        Accuracy: loc.accuracy ?? null,
        // ✅ keep numeric timestamp in ms (backend-friendly)
        Timestamp: loc.timestamp ? Date.parse(loc.timestamp) : Date.now(),
        Speed: loc.speed ?? null,
        Bearing: loc.bearing ?? null,
      };

      // optional: store last known point for UI/ETA
      localStorage.setItem("sky_last_loc", JSON.stringify(payload));

      enqueue(payload);

      try {
        await flushQueue();
      } catch {}
    },
    [selectedShipment, flushQueue]
  );

  useBackgroundLocation({ onLocation: handleLocation });

  return null;
}
