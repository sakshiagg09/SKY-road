// src/components/WakeWordManager.jsx
//
// Listens continuously using AudioRecorderPlugin (raw AudioRecord, no OEM beep).
// Every 2-second speech window is sent to the CAP backend → Whisper → wake word check.
// On detection, fires onWakeWord(remainingTranscript).
//
// iOS / web: not supported (no-op).

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import AudioRecorder from "../audioRecorder";
import { apiPost } from "../auth/api";

const COOLDOWN_MS = 3000; // ignore further detections for 3s after a wake word fires

export default function WakeWordManager({ enabled, onWakeWord }) {
  const activeRef    = useRef(false);
  const inflight     = useRef(false); // prevent overlapping Whisper calls
  const lastFiredRef = useRef(0);
  const listenerRef  = useRef(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android" || !AudioRecorder) return;

    if (enabled) {
      startWakeWord();
    } else {
      stopWakeWord();
    }

    return () => { stopWakeWord(); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const startWakeWord = async () => {
    if (activeRef.current) return;
    try {
      const perm = await AudioRecorder.requestPermissions();
      if (perm.microphone !== "granted") return;

      // Remove any stale listener before adding a new one
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }

      listenerRef.current = await AudioRecorder.addListener("chunk", handleChunk);
      activeRef.current = true;
      await AudioRecorder.startWakeWord();
      console.log("[WakeWord] started");
    } catch (e) {
      console.warn("[WakeWord] startWakeWord error:", e);
      activeRef.current = false;
    }
  };

  const stopWakeWord = async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    try {
      if (listenerRef.current) { listenerRef.current.remove(); listenerRef.current = null; }
      await AudioRecorder.stopWakeWord();
      console.log("[WakeWord] stopped");
    } catch (e) {
      console.warn("[WakeWord] stopWakeWord error:", e);
    }
  };

  const handleChunk = async ({ audioBase64 }) => {
    if (!activeRef.current || inflight.current) return;
    const now = Date.now();
    if (now - lastFiredRef.current < COOLDOWN_MS) return;

    inflight.current = true;
    try {
      const result = await apiPost("/odata/v4/GTT/detectWakeWord", { audioBase64 });
      if (result?.detected && activeRef.current) {
        lastFiredRef.current = Date.now();
        console.log("[WakeWord] detected! remaining:", result.transcript);
        await stopWakeWord();
        onWakeWord?.(result.transcript || "");
      }
    } catch (e) {
      console.warn("[WakeWord] detection error:", e);
    } finally {
      inflight.current = false;
    }
  };

  return null; // no UI
}
