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
            // IMPORTANT: don't use 0 unless you really want spam
            distanceFilter: 10, // meters (use 0 only for testing)
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

            // throttle to avoid too many posts (optional but recommended)
            const now = Date.now();
            if (now - lastSentAt < 4000) return; // 4s throttle
            lastSentAt = now;

            const payload = {
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy: loc.accuracy ?? null,
              speed: loc.speed ?? null,
              bearing: loc.bearing ?? null,
              timestamp: loc.time ? Number(loc.time) : now, // epoch ms
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
