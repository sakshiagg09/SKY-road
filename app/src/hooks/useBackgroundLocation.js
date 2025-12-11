// src/hooks/useBackgroundLocation.js
import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

export function useBackgroundLocation({ onLocation }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let watcherId = null;
    let retryTimer = null;

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
            distanceFilter: 0, // immediate updates
          },
          async (loc, error) => {
            if (error) {
              console.warn("SKY BG Error:", error);

              if (error.code === "NOT_AUTHORIZED") {
                console.log("Attempting to request permission again...");
                await BackgroundGeolocation.requestPermissions();
              }
              return;
            }

            if (!loc) return;

            const payload = {
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy: loc.accuracy,
              timestamp: new Date().toISOString(),
            };

            onLocation && onLocation(payload);
          }
        );
      } catch (e) {
        console.error("Watcher start failed:", e);

        // retry if OS temporarily blocks GPS
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
