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

const PRIMARY       = "#1976D2";
const TEXT_PRIMARY  = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";
const BG   = "#EFF0F3";
const CARD = "#FFFFFF";

const PRIORITY_COLORS = {
  Low:    { bg: "#E3F4E8", color: "#2E7D32" },
  Normal: { bg: "#FFF1DA", color: "#EA7600" },
  High:   { bg: "#FDE4E4", color: "#D32F2F" },
};

const EVENT_ICON = { Delay: "⏱", Accident: "⚠️", "Customs Hold": "🛃", Other: "📋" };

export default function VoiceDelaySheet({ open, onClose, onResult, autoStart = false }) {
  const [voiceState, setVoiceState]       = useState("idle"); // idle|listening|processing|result|error
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [result, setResult]               = useState(null);
  const [errorMsg, setErrorMsg]           = useState("");
  const [showManual, setShowManual]       = useState(false);
  const [manualText, setManualText]       = useState("");

  const recognitionRef  = useRef(null);   // Web SpeechRecognition
  const nativeListening = useRef(false);  // Native plugin active flag
  const liveRef  = useRef("");
  const finalRef = useRef("");

  // Reset when sheet opens/closes; auto-start recording if triggered by wake word
  useEffect(() => {
    if (open) {
      setVoiceState("idle");
      setLiveTranscript("");
      setFinalTranscript("");
      setResult(null);
      setErrorMsg("");
      setShowManual(false);
      setManualText("");
      liveRef.current  = "";
      finalRef.current = "";

      if (autoStart) {
        // Small delay: let drawer animation finish + WakeWordListener mic release
        const t = setTimeout(() => startListening(), 600);
        return () => clearTimeout(t);
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Interpret transcript via CAP action ────────────────────────────────────
  const interpretMessage = async (text) => {
    setFinalTranscript(text);
    setVoiceState("processing");
    try {
      const res = await fetch("/odata/v4/GTT/interpretVoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setResult(data);
      setVoiceState("result");
    } catch (e) {
      setErrorMsg(e.message || "Failed to interpret message.");
      setVoiceState("error");
    }
  };

  // ── Native path: @capacitor-community/speech-recognition ──────────────────
  const startNativeListening = async () => {
    try {
      const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");

      // Request permission
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        setErrorMsg("Microphone permission denied.");
        setVoiceState("error");
        return;
      }

      // Clear any stale listeners (e.g. from WakeWordListener)
      await SpeechRecognition.removeAllListeners();

      // Listen to partial results to update live transcript
      await SpeechRecognition.addListener("partialResults", (data) => {
        const partial = Array.isArray(data.matches) ? data.matches[0] || "" : "";
        liveRef.current = partial;
        setLiveTranscript(partial);
      });

      nativeListening.current = true;
      setVoiceState("listening");

      // Loop: Android auto-stops after silence — restart until user taps stop
      while (nativeListening.current) {
        await SpeechRecognition.start({
          language: "en-US",
          maxResults: 1,
          partialResults: true,
          popup: false,
        });
        // start() resolved — Android ended the session
        // If user hasn't tapped stop, wait briefly and restart
        if (!nativeListening.current) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      await SpeechRecognition.removeAllListeners();

      const text = liveRef.current;
      if (text.trim()) {
        interpretMessage(text.trim());
      } else {
        setVoiceState("idle");
      }
    } catch (e) {
      nativeListening.current = false;
      setErrorMsg(`Voice error: ${e.message || e}`);
      setVoiceState("error");
    }
  };

  const stopNativeListening = async () => {
    if (!nativeListening.current) return;
    // Set flag FIRST so the restart loop exits when start() resolves
    nativeListening.current = false;
    try {
      const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
      await SpeechRecognition.stop();
    } catch (_) {}
  };

  // ── Web path: webkitSpeechRecognition (continuous) ─────────────────────────
  const startWebListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErrorMsg("Speech recognition not supported in this browser. Use Chrome or tap 'Type instead'.");
      setVoiceState("error");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => setVoiceState("listening");

    recognition.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final  += event.results[i][0].transcript + " ";
        else                          interim += event.results[i][0].transcript;
      }
      const display = (final + interim).trim();
      liveRef.current  = display;
      finalRef.current = final.trim();
      setLiveTranscript(display);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      const text = finalRef.current || liveRef.current;
      if (text) interpretMessage(text);
      else      setVoiceState("idle");
    };

    recognition.onerror = (e) => {
      if (e.error === "no-speech") return; // ignore pauses in continuous mode
      recognitionRef.current = null;
      setErrorMsg(`Mic error: ${e.error}. Try typing instead.`);
      setVoiceState("error");
    };

    recognition.start();
  };

  // ── Unified start / stop ───────────────────────────────────────────────────
  const startListening = () => {
    liveRef.current  = "";
    finalRef.current = "";
    setLiveTranscript("");
    if (Capacitor.isNativePlatform()) {
      startNativeListening();
    } else {
      startWebListening();
    }
  };

  const stopListening = () => {
    if (Capacitor.isNativePlatform()) {
      stopNativeListening();
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // ── Manual text submit ─────────────────────────────────────────────────────
  const handleManualSubmit = () => {
    const text = manualText.trim();
    if (!text) return;
    setShowManual(false);
    interpretMessage(text);
  };

  const handleReset = () => {
    recognitionRef.current = null;
    setVoiceState("idle");
    setLiveTranscript("");
    setFinalTranscript("");
    setResult(null);
    setErrorMsg("");
    liveRef.current  = "";
    finalRef.current = "";
  };

  const handleReport = () => {
    if (result && onResult) onResult(result);
  };

  const formatDelay = (mins) => {
    if (!mins || mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
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
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: BG,
          maxHeight: "88vh",
          overflow: "hidden",
        },
      }}
    >
      {/* Drag handle */}
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
              Speak to report a delay or event
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ bgcolor: "#E8EAF0", "&:hover": { bgcolor: "#D9DCE6" } }}>
          <CloseRoundedIcon sx={{ fontSize: 18, color: TEXT_SECONDARY }} />
        </IconButton>
      </Box>

      {/* Scrollable body */}
      <Box sx={{ px: 3, pb: 4, overflowY: "auto" }}>

        {/* ── IDLE ── */}
        {voiceState === "idle" && !showManual && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 3, gap: 3 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, textAlign: "center", maxWidth: 280 }}>
              Tap the mic and describe any delays or issues. Tap stop when done — we won't cut you off during pauses.
            </Typography>

            <Box
              onClick={startListening}
              sx={{
                width: 88, height: 88, borderRadius: "50%",
                background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 10px 28px rgba(25,118,210,0.42), -4px -4px 12px rgba(255,255,255,0.8)",
                transition: "transform 0.15s ease",
                "&:active": { transform: "scale(0.94)" },
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
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY }}>
              Describe the delay or issue:
            </Typography>
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
                onClick={handleManualSubmit}
                variant="contained"
                disabled={!manualText.trim()}
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
                bgcolor: "rgba(211,47,47,0.14)",
                animation: "pulse-ring 1.4s ease-out infinite",
                "@keyframes pulse-ring": {
                  "0%":   { transform: "scale(0.82)", opacity: 1 },
                  "100%": { transform: "scale(1.45)", opacity: 0 },
                },
              }} />
              <Box
                onClick={stopListening}
                sx={{
                  width: 88, height: 88, borderRadius: "50%",
                  background: "linear-gradient(135deg, #D32F2F 0%, #EF5350 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 1,
                  boxShadow: "0 8px 24px rgba(211,47,47,0.4)",
                  transition: "transform 0.15s",
                  "&:active": { transform: "scale(0.94)" },
                }}
              >
                <StopIcon sx={{ fontSize: 40, color: "#fff" }} />
              </Box>
            </Box>

            <Typography sx={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>Listening…</Typography>

            {liveTranscript && (
              <Box sx={{ bgcolor: CARD, borderRadius: "14px", p: 2, width: "100%", boxShadow: "4px 4px 12px #D9DCE6, -4px -4px 12px #ffffff" }}>
                <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: "italic" }}>
                  "{liveTranscript}"
                </Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY }}>
              Tap the red button when done speaking
            </Typography>
          </Box>
        )}

        {/* ── PROCESSING ── */}
        {voiceState === "processing" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 3 }}>
            <CircularProgress size={52} thickness={4} sx={{ color: PRIMARY }} />
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>Interpreting…</Typography>
              <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, mt: 0.5 }}>Analysing your message</Typography>
            </Box>
            {finalTranscript && (
              <Box sx={{ bgcolor: CARD, borderRadius: "14px", p: 2, width: "100%", boxShadow: "4px 4px 12px #D9DCE6, -4px -4px 12px #ffffff" }}>
                <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.5 }}>
                  Your message
                </Typography>
                <Typography sx={{ fontSize: 13, color: TEXT_PRIMARY, fontStyle: "italic" }}>
                  "{finalTranscript}"
                </Typography>
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
              {/* Event type row */}
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
                  <Chip
                    label={result.priority}
                    size="small"
                    sx={{
                      bgcolor: PRIORITY_COLORS[result.priority]?.bg ?? "#F0F0F0",
                      color:   PRIORITY_COLORS[result.priority]?.color ?? TEXT_SECONDARY,
                      fontWeight: 700, fontSize: 11,
                    }}
                  />
                )}
              </Box>

              {/* Delay duration */}
              {result.delayMinutes > 0 && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.2, bgcolor: "#EAF4FF", borderRadius: "10px", borderLeft: `3px solid ${PRIMARY}` }}>
                  <AccessTimeIcon sx={{ fontSize: 20, color: PRIMARY }} />
                  <Box>
                    <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY }}>Estimated delay</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{formatDelay(result.delayMinutes)}</Typography>
                  </Box>
                </Box>
              )}

              {/* Notes */}
              {result.notes && (
                <Box>
                  <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.5 }}>Summary</Typography>
                  <Typography sx={{ fontSize: 13, color: TEXT_PRIMARY, lineHeight: 1.5 }}>{result.notes}</Typography>
                </Box>
              )}

              {/* Original transcript */}
              <Box sx={{ borderTop: "1px solid #EAECF4", pt: 1.5 }}>
                <Typography sx={{ fontSize: 10, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.4 }}>Original message</Typography>
                <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY, fontStyle: "italic" }}>"{finalTranscript}"</Typography>
              </Box>
            </Box>

            {/* Actions */}
            <Box sx={{ display: "flex", gap: 1.5, mt: 0.5 }}>
              <Button
                onClick={handleReset}
                startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                sx={{
                  flex: 1, textTransform: "none", borderRadius: "12px",
                  border: "1px solid #CBD2E0", color: TEXT_SECONDARY,
                  bgcolor: CARD, fontWeight: 500, "&:hover": { bgcolor: "#F0F2F8" },
                }}
              >
                Re-record
              </Button>
              <Button
                onClick={handleReport}
                variant="contained"
                endIcon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
                sx={{
                  flex: 2, textTransform: "none", borderRadius: "12px", fontWeight: 600,
                  background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
                  boxShadow: "0 6px 18px rgba(25,118,210,0.38)",
                  "&:hover": { background: "linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)" },
                }}
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
              <Button onClick={handleReset} variant="outlined" sx={{ textTransform: "none", borderRadius: 2 }}>
                Try Again
              </Button>
              <Button onClick={() => { handleReset(); setShowManual(true); }} variant="contained" sx={{ textTransform: "none", borderRadius: 2, bgcolor: PRIMARY }}>
                Type Instead
              </Button>
            </Box>
          </Box>
        )}

      </Box>
    </Drawer>
  );
}
