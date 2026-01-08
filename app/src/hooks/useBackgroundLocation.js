// src/hooks/useBackgroundLocation.js
import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

export function useBackgroundLocation({ onLocation }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let watcherId = null;
    let retryTimer = null;
    let lastSentAt = 0;

    async function startWatcher() {
      try {
        const perm = await BackgroundGeolocation.requestPermissions();
        console.log("SKY Permissions:", perm);

        watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Tracking route for SKY...",
            backgroundTitle: "SKY – Tracking Active",
            requestPermissions: true,
            stale: false,
            distanceFilter: 10, // meters
          },
          async (loc, error) => {
            if (error) {
              console.warn("SKY BG Error:", error);
              if (error.code === "NOT_AUTHORIZED") {
                await BackgroundGeolocation.requestPermissions();
              }
              return;
            }
            if (!loc) return;

            // throttle to avoid too many posts
            const now = Date.now();
            if (now - lastSentAt < 4000) return; // 4s throttle
            lastSentAt = now;

            const lat = Number(loc?.latitude);
            const lng = Number(loc?.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const t = Number(loc?.time);
            const timestamp = Number.isFinite(t) ? t : now;

            const s = Number(loc?.speed);
            const speed = Number.isFinite(s) ? s : null; // keep as m/s; convert in manager

            const b = Number(loc?.bearing);
            const bearing = Number.isFinite(b) ? b : null;

            const a = Number(loc?.accuracy);
            const accuracy = Number.isFinite(a) ? a : null;

            const payload = {
              latitude: lat,
              longitude: lng,
              accuracy,
              speed,
              bearing,
              timestamp,
            };

            onLocation && onLocation(payload);
          }
        );
      } catch (e) {
        console.error("Watcher start failed:", e);
        retryTimer = setTimeout(startWatcher, 5000);
      }
    }

    startWatcher();

    return () => {
      if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId });
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [onLocation]);
}
