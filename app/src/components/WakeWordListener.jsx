// app/src/components/WakeWordListener.jsx
// Background component — renders nothing, listens for "Hey Sky" wake word
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

// Exact phrases to match (after punctuation stripped)
const WAKE_PHRASES = [
  "hey sky", "hi sky", "okay sky", "ok sky", "hey ski", "hi ski",
  "sky report", "sky delay", "a sky", "the sky please", "hey sky please",
];
// Activation words — any of these + "sky"/"ski" anywhere in utterance triggers
const ACTIVATION_WORDS = new Set(["hey", "hi", "okay", "ok", "aye"]);

export default function WakeWordListener({ enabled, onWakeWord }) {
  const enabledRef = useRef(enabled);
  const cooldownRef = useRef(false);
  const onWakeWordRef = useRef(onWakeWord);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onWakeWordRef.current = onWakeWord; }, [onWakeWord]);

  const checkForWakeWord = (text) => {
    if (!text || cooldownRef.current) return;
    // Strip punctuation and collapse whitespace before matching
    const lower = text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

    // 1. Exact phrase match
    const phraseHit = WAKE_PHRASES.some((phrase) => lower.includes(phrase));

    // 2. Flexible match: "sky"/"ski" AND any activation word anywhere in utterance
    const words = lower.split(" ");
    const wordSet = new Set(words);
    const flexHit = (wordSet.has("sky") || wordSet.has("ski")) &&
                    words.some((w) => ACTIVATION_WORDS.has(w));

    if (phraseHit || flexHit) {
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 3000);
      onWakeWordRef.current();
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      let active = true;

      const startNative = async () => {
        if (!active) return;
        try {
          // Remove stale listeners (e.g. from VoiceDelaySheet cleanup race)
          await SpeechRecognition.removeAllListeners();

          // Add listener FIRST before starting — catches all partial results
          await SpeechRecognition.addListener("partialResults", (data) => {
            if (!active) return;
            const text = Array.isArray(data?.matches) ? data.matches[0] : "";
            checkForWakeWord(text);
          });

          // start() resolves when Android ends the session (silence timeout)
          await SpeechRecognition.start({
            language: "en-US",
            partialResults: true,
            popup: false,
          });

          // Android auto-stopped — restart to keep listening
          if (active) setTimeout(startNative, 300);
        } catch (e) {
          console.log("WakeWord native error:", e);
          if (active) setTimeout(startNative, 1500);
        }
      };

      // Request permission once, then start loop
      // Small startup delay avoids race with VoiceDelaySheet's removeAllListeners on close
      SpeechRecognition.requestPermissions()
        .then(() => { if (active) setTimeout(startNative, 500); })
        .catch(() => {});

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
          if (alive && enabledRef.current) setTimeout(start, 300);
        };

        rec.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            alive = false;
            return;
          }
          if (alive && enabledRef.current) setTimeout(start, 1500);
        };

        try { rec.start(); } catch {}
      };

      start();

      return () => {
        alive = false;
        try { rec?.stop(); } catch {}
      };
    }
  }, [enabled]);

  return null;
}
