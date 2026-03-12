// app/src/components/WakeWordListener.jsx
// Background component — renders nothing, listens for "Hey Sky" wake word
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

const WAKE_PHRASES = ["hey sky", "hi sky", "okay sky", "ok sky", "a sky", "hey ski"];

export default function WakeWordListener({ enabled, onWakeWord }) {
  const enabledRef = useRef(enabled);
  const cooldownRef = useRef(false); // prevent double-trigger within 3s

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const checkForWakeWord = (text) => {
    if (!text || cooldownRef.current) return;
    const lower = text.toLowerCase().trim();
    if (WAKE_PHRASES.some((phrase) => lower.includes(phrase))) {
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 3000);
      onWakeWord();
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      let active = true;

      (async () => {
        try {
          await SpeechRecognition.requestPermissions();
          await SpeechRecognition.startListening({
            language: "en-US",
            partialResults: true,
            popup: false,
          });

          await SpeechRecognition.addListener("partialResults", (data) => {
            if (!active) return;
            const text = Array.isArray(data?.matches) ? data.matches[0] : "";
            checkForWakeWord(text);
          });
        } catch (e) {
          console.log("WakeWord native error:", e);
        }
      })();

      return () => {
        active = false;
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      };
    } else {
      // Web: Web Speech API with auto-restart
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        console.log("WakeWord: SpeechRecognition not supported in this browser");
        return;
      }

      let alive = true;
      let rec = null;

      const start = () => {
        if (!alive) return;
        rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";

        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            checkForWakeWord(e.results[i][0].transcript);
          }
        };

        rec.onend = () => {
          // Browser stops recognition after silence — auto-restart
          if (alive && enabledRef.current) {
            setTimeout(start, 300);
          }
        };

        rec.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            alive = false; // mic permission denied — stop trying
            return;
          }
          // Transient errors — retry after a short delay
          if (alive && enabledRef.current) {
            setTimeout(start, 1500);
          }
        };

        try {
          rec.start();
        } catch {
          // already started or other transient error — ignore
        }
      };

      start();

      return () => {
        alive = false;
        try { rec?.stop(); } catch {}
      };
    }
  }, [enabled]); // restarts cleanly when enabled toggles

  return null;
}
