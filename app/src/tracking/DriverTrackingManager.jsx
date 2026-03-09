// src/tracking/DriverTrackingManager.jsx
import React, { useCallback, useEffect } from "react";
import { useBackgroundLocation } from "../hooks/useBackgroundLocation";
import { enqueue, peek, markSent } from "./locationQueue";
import { apiPost } from "../auth/api";

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

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
        await apiPost("/api/tracking/location", point);
        markSent(point._id);
      } catch (e) {
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

  // ✅ IMPORTANT: flush on mount / shipment change (helps after screen unlock/resume)
  useEffect(() => {
    flushQueue();
  }, [flushQueue, selectedShipment?.FoId, selectedShipment?.FreightOrderId]);

  const handleLocation = useCallback(
    async (loc) => {
      const { FoId, DriverId } = getContext();

      const ts = Number(loc?.timestamp);
      const safeTs = Number.isFinite(ts) ? ts : Date.now();

      const lat = Number(loc?.latitude);
      const lng = Number(loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      // Speed from plugin is typically m/s -> convert to km/h (and sanitize)
      const rawSpeed = Number(loc?.speed);
      const speedKmhFromGps =
        Number.isFinite(rawSpeed) && rawSpeed >= 0 ? rawSpeed * 3.6 : null;

      // Fallback speed if GPS speed is missing (common after unlock/resume)
      const prevRaw = localStorage.getItem("sky_last_loc");
      const prev = prevRaw ? JSON.parse(prevRaw) : null;

      let finalSpeedKmh = speedKmhFromGps;

      if (
        finalSpeedKmh == null &&
        prev?.Latitude != null &&
        prev?.Longitude != null &&
        prev?.Timestamp != null
      ) {
        const distM = haversineMeters(
          { lat: Number(prev.Latitude), lng: Number(prev.Longitude) },
          { lat, lng }
        );
        const dtS = Math.max(1, (safeTs - Number(prev.Timestamp)) / 1000);
        const computedKmh = (distM / dtS) * 3.6;

        // Ignore jitter spikes
        finalSpeedKmh =
          Number.isFinite(computedKmh) && computedKmh >= 0 && computedKmh <= 160
            ? computedKmh
            : null;
      }

      const bearing = Number(loc?.bearing);
      const safeBearing = Number.isFinite(bearing) ? bearing : null;

      const acc = Number(loc?.accuracy);
      const safeAcc = Number.isFinite(acc) ? acc : null;

      const payload = {
        FoId,
        DriverId,
        Latitude: lat,
        Longitude: lng,
        Accuracy: safeAcc,
        Timestamp: safeTs,
        Speed: finalSpeedKmh,
        Bearing: safeBearing,
      };

      // Store last known point for UI/ETA and fallback speed calculation
      localStorage.setItem("sky_last_loc", JSON.stringify(payload));

      // Queue first (offline safe)
      enqueue(payload);

      // Try to send immediately
      try {
        await flushQueue();
      } catch {
        /* ignore */
      }
    },
    [selectedShipment, flushQueue]
  );

  useBackgroundLocation({ onLocation: handleLocation });

  return null;
}
