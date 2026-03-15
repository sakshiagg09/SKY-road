// src/components/VoiceDelaySheet.jsx
import { useState, useRef, useEffect } from "react";
import {
  Drawer, Box, Typography, IconButton, CircularProgress,
  Chip, Button, TextField,
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import SendIcon from "@mui/icons-material/Send";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import { Capacitor } from "@capacitor/core";
import AudioRecorder from "../audioRecorder";
import { apiPost } from "../auth/api";

const PRIMARY        = "#1976D2";
const TEXT_PRIMARY   = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";
const BG   = "#EFF0F3";
const CARD = "#FFFFFF";

const PRIORITY_COLORS = {
  Low:    { bg: "#E3F4E8", color: "#2E7D32" },
  Normal: { bg: "#FFF1DA", color: "#EA7600" },
  High:   { bg: "#FDE4E4", color: "#D32F2F" },
};
const EVENT_ICON = { Delay: "⏱", Accident: "⚠️", "Customs Hold": "🛃", Other: "📋" };

/**
 * VoiceDelaySheet
 *
 * Props:
 *   open              — controls drawer visibility
 *   onClose           — called when user closes
 *   onResult(result)  — called when interpretation is ready (auto-submits in App)
 *   initialTranscript — if provided (from wake word), skip recording and go straight to interpret
 */
export default function VoiceDelaySheet({ open, onClose, onResult, initialTranscript = "" }) {
  const [voiceState, setVoiceState]           = useState("idle"); // idle|listening|processing|result|error
  const [transcript, setTranscript]           = useState("");
  const [result, setResult]                   = useState(null);
  const [errorMsg, setErrorMsg]               = useState("");
  const [showManual, setShowManual]           = useState(false);
  const [manualText, setManualText]           = useState("");

  const webRecognitionRef = useRef(null);
  const androidRecording  = useRef(false);

  // ── Reset & handle initialTranscript on open ───────────────────────────────
  useEffect(() => {
    if (!open) {
      stopAndCleanup();
      return;
    }

    setVoiceState("idle");
    setTranscript("");
    setResult(null);
    setErrorMsg("");
    setShowManual(false);
    setManualText("");

    if (initialTranscript?.trim()) {
      // Wake word already captured a command — skip recording
      interpretMessage(initialTranscript.trim());
    } else {
      // Auto-start recording immediately when sheet opens
      setTimeout(() => {
        if (Capacitor.getPlatform() === "android") startAndroidRecording();
        else startWebRecording();
      }, 300); // brief delay so the drawer animation completes first
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopAndCleanup = () => {
    if (Capacitor.getPlatform() === "android" && AudioRecorder && androidRecording.current) {
      androidRecording.current = false;
      AudioRecorder.stop().catch(() => {});
    }
    if (webRecognitionRef.current) {
      try { webRecognitionRef.current.abort(); } catch (_) {}
      webRecognitionRef.current = null;
    }
  };

  // ── Interpret transcript via CAP + OpenAI Whisper pipeline ─────────────────
  const interpretMessage = async (text) => {
    setTranscript(text);
    setVoiceState("processing");
    try {
      const data = await apiPost("/odata/v4/GTT/interpretVoice", { transcript: text });
      setResult(data);
      setVoiceState("result");
      if (onResult) onResult(data);
    } catch (e) {
      setErrorMsg(e.message || "Failed to interpret. Please try again.");
      setVoiceState("error");
    }
  };

  // ── Android: AudioRecord (raw PCM, no beep) → Whisper on stop ──────────────
  const startAndroidRecording = async () => {
    if (!AudioRecorder) {
      setErrorMsg("Audio recording not available.");
      setVoiceState("error");
      return;
    }
    try {
      const perm = await AudioRecorder.requestPermissions();
      if (perm.microphone !== "granted") {
        setErrorMsg("Microphone permission denied.");
        setVoiceState("error");
        return;
      }
      androidRecording.current = true;
      setVoiceState("listening");
      await AudioRecorder.start();
    } catch (e) {
      androidRecording.current = false;
      setErrorMsg(`Could not start recording: ${e.message || e}`);
      setVoiceState("error");
    }
  };

  const stopAndroidRecording = async () => {
    if (!androidRecording.current) return;
    androidRecording.current = false;
    setVoiceState("processing");
    try {
      const { audioBase64 } = await AudioRecorder.stop();
      if (!audioBase64) { setVoiceState("idle"); return; }
      const { transcript: text } = await apiPost("/odata/v4/GTT/transcribeAudio", { audioBase64 });
      if (!text?.trim()) {
        setErrorMsg("Could not detect speech. Please try again.");
        setVoiceState("error");
        return;
      }
      interpretMessage(text.trim());
    } catch (e) {
      setErrorMsg(e.message || "Transcription failed. Please try again.");
      setVoiceState("error");
    }
  };

  const cancelRecording = () => {
    if (Capacitor.getPlatform() === "android" && AudioRecorder && androidRecording.current) {
      androidRecording.current = false;
      AudioRecorder.stop().catch(() => {});
    }
    if (webRecognitionRef.current) {
      try { webRecognitionRef.current.abort(); } catch (_) {}
      webRecognitionRef.current = null;
    }
    onClose();
  };

  // ── Web: webkitSpeechRecognition (continuous) ──────────────────────────────
  const startWebRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErrorMsg("Speech recognition not supported. Use Chrome or tap 'Type instead'.");
      setVoiceState("error");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    webRecognitionRef.current = recognition;
    let finalText = "";

    recognition.onstart  = () => setVoiceState("listening");
    recognition.onresult = (e) => {
      let final = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final  += e.results[i][0].transcript + " ";
        else                      interim += e.results[i][0].transcript;
      }
      finalText = final.trim();
      setTranscript((final + interim).trim());
    };
    recognition.onend  = () => {
      webRecognitionRef.current = null;
      if (finalText) interpretMessage(finalText);
      else setVoiceState("idle");
    };
    recognition.onerror = (e) => {
      if (e.error === "no-speech") return;
      webRecognitionRef.current = null;
      setErrorMsg(`Mic error: ${e.error}`);
      setVoiceState("error");
    };
    recognition.start();
  };

  // ── Unified start / stop ───────────────────────────────────────────────────
  const startListening = () => {
    setTranscript("");
    if (Capacitor.getPlatform() === "android") startAndroidRecording();
    else startWebRecording();
  };

  const stopListening = () => {
    if (Capacitor.getPlatform() === "android") stopAndroidRecording();
    else if (webRecognitionRef.current) webRecognitionRef.current.stop();
  };

  // ── Manual text ────────────────────────────────────────────────────────────
  const handleManualSubmit = () => {
    const text = manualText.trim();
    if (!text) return;
    setShowManual(false);
    interpretMessage(text);
  };

  const handleReset = () => {
    setVoiceState("idle");
    setTranscript("");
    setResult(null);
    setErrorMsg("");
    webRecognitionRef.current = null;
  };

  const formatDelay = (mins) => {
    if (!mins || mins <= 0) return null;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h} hour${h > 1 ? "s" : ""}`;
    return `${m} min`;
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          backgroundColor: BG, maxHeight: "88vh", overflow: "hidden",
        },
      }}
    >
      {/* Handle */}
      <Box sx={{ display: "flex", justifyContent: "center", pt: 1.5, pb: 0.5 }}>
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "#CBD2E0" }} />
      </Box>

      {/* Header */}
      <Box sx={{ px: 3, pt: 1, pb: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(25,118,210,0.12) 0%, rgba(66,165,245,0.18) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AutoAwesomeIcon sx={{ fontSize: 20, color: PRIMARY }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.2 }}>
              Voice Report
            </Typography>
            <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY }}>
              Say "Hey Sky" or tap the mic
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ bgcolor: "#E8EAF0", "&:hover": { bgcolor: "#D9DCE6" } }}>
          <CloseRoundedIcon sx={{ fontSize: 18, color: TEXT_SECONDARY }} />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ px: 3, pb: 4, overflowY: "auto" }}>

        {/* ── IDLE ── */}
        {voiceState === "idle" && !showManual && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 3, gap: 3 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, textAlign: "center", maxWidth: 280 }}>
              Tap the mic, describe any delay, then tap stop.
            </Typography>

            <Box
              onClick={startListening}
              sx={{
                width: 88, height: 88, borderRadius: "50%",
                background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 10px 28px rgba(25,118,210,0.42), -4px -4px 12px rgba(255,255,255,0.8)",
                "&:active": { transform: "scale(0.94)" },
                transition: "transform 0.15s ease",
              }}
            >
              <MicIcon sx={{ fontSize: 42, color: "#fff" }} />
            </Box>

            <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY }}>Tap to start recording</Typography>

            <Button
              startIcon={<KeyboardIcon sx={{ fontSize: 16 }} />}
              onClick={() => setShowManual(true)}
              sx={{
                textTransform: "none", fontSize: 12, color: TEXT_SECONDARY,
                borderRadius: 99, border: "1px solid #CBD2E0", px: 2.5, py: 0.75,
                bgcolor: CARD, "&:hover": { bgcolor: "#F0F2F8" },
              }}
            >
              Type instead
            </Button>
          </Box>
        )}

        {/* ── MANUAL INPUT ── */}
        {showManual && voiceState === "idle" && (
          <Box sx={{ py: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY }}>Describe the delay or issue:</Typography>
            <TextField
              multiline minRows={3} fullWidth autoFocus
              placeholder='e.g. "Stuck in traffic on highway 8, will be 2 hours late"'
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px", backgroundColor: CARD } }}
            />
            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
              <Button onClick={() => setShowManual(false)} sx={{ textTransform: "none", color: TEXT_SECONDARY, borderRadius: 2 }}>
                Cancel
              </Button>
              <Button
                onClick={handleManualSubmit} variant="contained" disabled={!manualText.trim()}
                endIcon={<SendIcon sx={{ fontSize: 16 }} />}
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)" }}
              >
                Interpret
              </Button>
            </Box>
          </Box>
        )}

        {/* ── LISTENING ── */}
        {voiceState === "listening" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 3, gap: 3 }}>
            <Box sx={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Box sx={{
                position: "absolute", width: 112, height: 112, borderRadius: "50%",
                bgcolor: "rgba(211,47,47,0.14)", pointerEvents: "none",
                animation: "pulse-ring 1.4s ease-out infinite",
                "@keyframes pulse-ring": {
                  "0%": { transform: "scale(0.82)", opacity: 1 },
                  "100%": { transform: "scale(1.45)", opacity: 0 },
                },
              }} />
              <Box
                onPointerDown={stopListening}
                sx={{
                  width: 96, height: 96, borderRadius: "50%",
                  background: "linear-gradient(135deg, #D32F2F 0%, #EF5350 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 1,
                  boxShadow: "0 8px 24px rgba(211,47,47,0.4)",
                  touchAction: "manipulation", userSelect: "none",
                  "&:active": { transform: "scale(0.92)" },
                }}
              >
                <StopIcon sx={{ fontSize: 44, color: "#fff" }} />
              </Box>
            </Box>

            <Typography sx={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>Listening…</Typography>

            {transcript && (
              <Box sx={{ bgcolor: CARD, borderRadius: "14px", p: 2, width: "100%", boxShadow: "4px 4px 12px #D9DCE6, -4px -4px 12px #ffffff" }}>
                <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: "italic" }}>"{transcript}"</Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY }}>Tap the red button when done</Typography>

            <Button
              onClick={cancelRecording}
              sx={{ textTransform: "none", fontSize: 13, color: TEXT_SECONDARY, borderRadius: 99, border: "1px solid #CBD2E0", px: 3, py: 0.75, bgcolor: CARD }}
            >
              Cancel
            </Button>
          </Box>
        )}

        {/* ── PROCESSING ── */}
        {voiceState === "processing" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 3 }}>
            <CircularProgress size={52} thickness={4} sx={{ color: PRIMARY }} />
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>Processing…</Typography>
              <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, mt: 0.5 }}>Transcribing and analysing</Typography>
            </Box>
            {transcript && (
              <Box sx={{ bgcolor: CARD, borderRadius: "14px", p: 2, width: "100%", boxShadow: "4px 4px 12px #D9DCE6, -4px -4px 12px #ffffff" }}>
                <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.5 }}>Your message</Typography>
                <Typography sx={{ fontSize: 13, color: TEXT_PRIMARY, fontStyle: "italic" }}>"{transcript}"</Typography>
              </Box>
            )}
          </Box>
        )}

        {/* ── RESULT ── */}
        {voiceState === "result" && result && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, py: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AutoAwesomeIcon sx={{ fontSize: 15, color: PRIMARY }} />
              <Typography sx={{ fontSize: 11, color: PRIMARY, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Interpretation
              </Typography>
            </Box>

            <Box sx={{ bgcolor: CARD, borderRadius: "18px", p: 2.5, boxShadow: "6px 6px 18px #D5D9E2, -6px -6px 18px #ffffff", display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Box sx={{ width: 42, height: 42, borderRadius: "12px", bgcolor: "#FDE4E4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                    {EVENT_ICON[result.eventType] ?? "📋"}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8 }}>Event Type</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>{result.eventType}</Typography>
                  </Box>
                </Box>
                {result.priority && (
                  <Chip label={result.priority} size="small" sx={{
                    bgcolor: PRIORITY_COLORS[result.priority]?.bg ?? "#F0F0F0",
                    color:   PRIORITY_COLORS[result.priority]?.color ?? TEXT_SECONDARY,
                    fontWeight: 700, fontSize: 11,
                  }} />
                )}
              </Box>

              {result.delayMinutes > 0 && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.2, bgcolor: "#EAF4FF", borderRadius: "10px", borderLeft: `3px solid ${PRIMARY}` }}>
                  <AccessTimeIcon sx={{ fontSize: 20, color: PRIMARY }} />
                  <Box>
                    <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY }}>Estimated delay</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{formatDelay(result.delayMinutes)}</Typography>
                  </Box>
                </Box>
              )}

              {result.notes && (
                <Box>
                  <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.5 }}>Summary</Typography>
                  <Typography sx={{ fontSize: 13, color: TEXT_PRIMARY, lineHeight: 1.5 }}>{result.notes}</Typography>
                </Box>
              )}

              <Box sx={{ borderTop: "1px solid #EAECF4", pt: 1.5 }}>
                <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.4 }}>Original message</Typography>
                <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY, fontStyle: "italic" }}>"{transcript}"</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 1.5, mt: 0.5 }}>
              <Button
                onClick={handleReset}
                startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                sx={{ flex: 1, textTransform: "none", borderRadius: "12px", border: "1px solid #CBD2E0", color: TEXT_SECONDARY, bgcolor: CARD, fontWeight: 500, "&:hover": { bgcolor: "#F0F2F8" } }}
              >
                Re-record
              </Button>
              <Button
                onClick={() => { if (result && onResult) onResult(result); }}
                variant="contained"
                endIcon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
                sx={{ flex: 2, textTransform: "none", borderRadius: "12px", fontWeight: 600, background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)", boxShadow: "0 6px 18px rgba(25,118,210,0.38)" }}
              >
                Report Now
              </Button>
            </Box>
          </Box>
        )}

        {/* ── ERROR ── */}
        {voiceState === "error" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 4, gap: 2 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: "#D32F2F" }}>Something went wrong</Typography>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, textAlign: "center" }}>{errorMsg}</Typography>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Button onClick={handleReset} variant="outlined" sx={{ textTransform: "none", borderRadius: 2 }}>Try Again</Button>
              <Button onClick={() => { handleReset(); setShowManual(true); }} variant="contained" sx={{ textTransform: "none", borderRadius: 2, bgcolor: PRIMARY }}>Type Instead</Button>
            </Box>
          </Box>
        )}

      </Box>
    </Drawer>
  );
}
