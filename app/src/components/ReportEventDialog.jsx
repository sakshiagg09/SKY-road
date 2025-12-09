// src/components/ReportEventDialog.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  TextField,
  Select,
  InputLabel,
  FormControl,
  Typography,
  Box,
  InputAdornment,
  Chip,
  Fade,
  Paper,
  IconButton,
  MenuItem,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import ReportOutlinedIcon from "@mui/icons-material/ReportOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LanguageIcon from "@mui/icons-material/Language";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import NotesIcon from "@mui/icons-material/Notes";

export default function ReportEventDialog({
  selectedShipment = null,
  open: controlledOpen,
  onClose: controlledOnClose,
}) {
  const FoId = selectedShipment?.FoId || "";

  const BG = "#EFF0F3";
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  const [open, setOpen] = useState(false);

  // ---- dialog open/close sync ----
  useEffect(() => {
    if (typeof controlledOpen === "boolean") setOpen(controlledOpen);
  }, [controlledOpen]);

  const isOpen = typeof controlledOpen === "boolean" ? controlledOpen : open;

  const handleOpen = () => setOpen(true);

  const closeDialog = () => {
    if (typeof controlledOnClose === "function") controlledOnClose();
    else setOpen(false);
  };

  // ---------------- FORM STATE ----------------

  const EVENT_VALUE = "Delay"; // UI label only

  const [referencedPlannedEvent] = useState("Arrival at Destination");
  const [selectedStop, setSelectedStop] = useState("");

  const [estimatedTime, setEstimatedTime] = useState(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d - tzOffset).toISOString().slice(0, 16);
  });
  const [estimatedTimeZone, setEstimatedTimeZone] = useState("UTC");

  const [reasonCode, setReasonCode] = useState(""); // EvtReasonCode
  const [reasonDescription, setReasonDescription] = useState("");

  const [reasonOptions, setReasonOptions] = useState([]);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [reasonsError, setReasonsError] = useState("");

  // ---------------- STOP FILTERING ----------------
  // Only show stops which are NOT departed

  const isStopDeparted = (stop) => {
    const ev = (stop.event || stop.Event || "").toString().toUpperCase();
    return ev === "DEPARTURE";
  };

  const upcomingStops = useMemo(() => {
    const stops = Array.isArray(selectedShipment?.stops)
      ? selectedShipment.stops
      : [];
    return stops.filter((s) => !isStopDeparted(s));
  }, [selectedShipment]);

  const getStopLabel = (stop, idx) => {
    const seq =
      stop.Sequence ||
      stop.StopSequence ||
      stop.sequence ||
      stop.stopSequence ||
      idx + 1;

    const loc =
      stop.LocationName ||
      stop.locationName ||
      stop.name ||
      stop.name1 ||
      stop.locId ||
      stop.locid ||
      "";

    return `Stop ${seq}${loc ? ` – ${loc}` : ""}`;
  };

  const getStopValue = (stop, idx) =>
    stop.stopid || // <-- from FinalInfo
    stop.StopId ||
    stop.stopId ||
    stop.Id ||
    stop.id ||
    String(idx);

  // initialise selected stop whenever shipment / stops change
  useEffect(() => {
    if (upcomingStops.length > 0) {
      const first = upcomingStops[0];
      const value = getStopValue(first, 0);
      setSelectedStop(value);
    } else {
      setSelectedStop("");
    }
  }, [upcomingStops]);

  // ---------------- REASON CODES (from CAP delayEvents) ----------------

  const fetchReasonCodes = async () => {
    setReasonsLoading(true);
    setReasonsError("");

    try {
      const res = await fetch("odata/v4/GTT/delayEvents");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      const rows = Array.isArray(data.value) ? data.value : [];
      setReasonOptions(rows);

      if (rows.length > 0 && !reasonCode) {
        const first = rows[0];
        const firstCode = first.EvtReasonCode;
        setReasonCode(firstCode || "");
        setReasonDescription(first.Description || "");
      }
    } catch (err) {
      console.error("Failed to load delay reasons:", err);
      setReasonsError("Failed to load reason codes.");
      setReasonOptions([]);
    } finally {
      setReasonsLoading(false);
    }
  };

  // load reasons when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchReasonCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // update description when reason changes (pre-fill from master)
  useEffect(() => {
    if (!reasonCode || reasonOptions.length === 0) return;
    const match = reasonOptions.find((r) => r.EvtReasonCode === reasonCode);
    if (match && !reasonDescription) {
      setReasonDescription(match.Description || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonCode, reasonOptions]);

  // ---------------- STYLES ----------------

  const modernInputStyle = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "#F7F8FC",
      borderRadius: "10px",
      transition: "all 0.2s ease",
      "& fieldset": {
        borderColor: "rgba(0, 0, 0, 0.08)",
        borderWidth: "1px",
      },
      "&:hover": {
        backgroundColor: CARD,
        "& fieldset": {
          borderColor: PRIMARY,
        },
      },
      "&.Mui-focused": {
        backgroundColor: CARD,
        "& fieldset": {
          borderColor: PRIMARY,
          borderWidth: "1.5px",
        },
        boxShadow: `0 0 0 2px ${alpha(PRIMARY, 0.15)}`,
      },
    },
    "& .MuiInputLabel-root": {
      color: TEXT_SECONDARY,
      fontWeight: 500,
      "&.Mui-focused": {
        color: PRIMARY,
      },
    },
  };

  // ---------------- HELPERS ----------------

  // convert "2025-12-08T23:00" -> "20251208230000"
  const toS4Timestamp = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;

    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hour = pad(d.getHours());
    const min = pad(d.getMinutes());
    const sec = pad(d.getSeconds());

    return `${year}${month}${day}${hour}${min}${sec}`;
  };

  // ---------------- PAYLOAD ----------------

  const buildPayload = () => {
    const reasonObj =
      reasonOptions.find((r) => r.EvtReasonCode === reasonCode) || {};

    return {
      FoId,
      StopId: selectedStop || "",
      ETA: toS4Timestamp(estimatedTime), 
      RefEvent: "Arrival" ,//referencedPlannedEvent || "",
      EventCode: reasonObj.EvtReasonCode || "DELAYED",
    };
  };

  const handleSubmit = async () => {
    const payload = buildPayload();
    console.log("Delay event payload:", payload);

    try {
      const res = await fetch("odata/v4/GTT/delayEvents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
      }

      console.log("Delay event posted OK:", await res.json().catch(() => null));
      alert("Unplanned delay reported successfully.");
      closeDialog();
    } catch (err) {
      console.error("Failed to post delay event:", err);
      alert("Failed to report delay. Please try again.");
    }
  };

  // ---------------- RENDER ----------------

  return (
    <>
      {typeof controlledOpen !== "boolean" && (
        <Box sx={{ display: "inline-block" }}>
          <Button
            variant="contained"
            onClick={handleOpen}
            startIcon={<ReportOutlinedIcon />}
            sx={{
              background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
              color: "#fff",
              borderRadius: "12px",
              px: 3,
              py: 1.1,
              textTransform: "none",
              fontWeight: 600,
              boxShadow: "0 8px 18px rgba(25,118,210,0.35)",
              "&:hover": {
                background: "linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)",
                boxShadow: "0 10px 24px rgba(25,118,210,0.45)",
              },
            }}
          >
            Report Delay
          </Button>
        </Box>
      )}

      <Dialog
        open={isOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
        TransitionComponent={Fade}
        BackdropProps={{
          sx: {
            backdropFilter: "blur(6px)",
            backgroundColor: "rgba(15,23,42,0.45)",
          },
        }}
        PaperProps={{
          sx: {
            borderRadius: "20px",
            boxShadow: "0 16px 40px rgba(15,23,42,0.32)",
            overflow: "hidden",
            backgroundColor: CARD,
          },
        }}
      >
        {/* HEADER */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
            px: 3,
            py: 2.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <WarningAmberIcon sx={{ color: "#fff", fontSize: 26 }} />
              <Box>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.9)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                  }}
                >
                  Exception Event
                </Typography>
                <Typography
                  sx={{
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: 700,
                    mt: 0.2,
                  }}
                >
                  Report Unplanned Delay
                </Typography>
              </Box>
            </Box>

            <IconButton
              onClick={closeDialog}
              sx={{
                color: "#fff",
                backgroundColor: "rgba(15,23,42,0.18)",
                "&:hover": {
                  backgroundColor: "rgba(15,23,42,0.32)",
                },
              }}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          <Paper
            elevation={0}
            sx={{
              mt: 2,
              display: "inline-flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.75,
              py: 0.75,
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,0.95)",
            }}
          >
            <LocalShippingIcon sx={{ color: PRIMARY, fontSize: 20 }} />
            <Box>
              <Typography
                sx={{
                  fontSize: 10,
                  color: TEXT_SECONDARY,
                  fontWeight: 500,
                  textTransform: "uppercase",
                }}
              >
                Freight Order ID
              </Typography>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                }}
              >
                {FoId || "Not Selected"}
              </Typography>
            </Box>
          </Paper>
        </Box>

        <DialogContent
          sx={{
            px: 3,
            py: 3,
            backgroundColor: BG,
          }}
        >
          {/* Event = Delay + Stop selector */}
          <Box
            sx={{
              mb: 3,
              backgroundColor: CARD,
              borderRadius: "14px",
              p: 2,
              border: "1px solid rgba(15,23,42,0.06)",
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: TEXT_SECONDARY,
                letterSpacing: 0.7,
                mb: 2,
                display: "flex",
                alignItems: "center",
                gap: 1,
                textTransform: "uppercase",
              }}
            >
              <WarningAmberIcon sx={{ fontSize: 16, color: "#EA7600" }} />
              Event Details
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 1.5,
              }}
            >
              {/* Event: always Delay (read only) */}
              <Box sx={{ flex: 1 }}>
                <TextField
                  label="Event"
                  fullWidth
                  value={EVENT_VALUE}
                  disabled
                  sx={modernInputStyle}
                  margin="dense"
                />
              </Box>

              {/* Stop: only NOT departed stops */}
              <Box sx={{ flex: 1 }}>
                <FormControl fullWidth sx={modernInputStyle} margin="dense">
                  <InputLabel>Stop</InputLabel>
                  <Select
                    value={selectedStop}
                    label="Stop"
                    onChange={(e) => setSelectedStop(e.target.value)}
                    disabled={upcomingStops.length === 0}
                  >
                    {upcomingStops.length === 0 && (
                      <MenuItem value="">
                        <Typography
                          variant="body2"
                          sx={{ color: TEXT_SECONDARY }}
                        >
                          No pending (non-departed) stops
                        </Typography>
                      </MenuItem>
                    )}

                    {upcomingStops.map((stop, idx) => {
                      const value = getStopValue(stop, idx);
                      const label = getStopLabel(stop, idx);
                      return (
                        <MenuItem key={value} value={value}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.5,
                            }}
                          >
                            <Chip
                              label={idx + 1}
                              size="small"
                              sx={{
                                bgcolor: "#E0EBFF",
                                color: PRIMARY,
                                fontWeight: 600,
                              }}
                            />
                            <Typography sx={{ color: TEXT_PRIMARY }}>
                              {label}
                            </Typography>
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Box>

          {/* Reference Event + ETA */}
          <Box
            sx={{
              mb: 3,
              backgroundColor: CARD,
              borderRadius: "14px",
              p: 2,
              border: "1px solid rgba(15,23,42,0.06)",
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: TEXT_SECONDARY,
                letterSpacing: 0.7,
                mb: 2,
                textTransform: "uppercase",
              }}
            >
              Reference Event
            </Typography>

            <TextField
              label="Reference Planned Event"
              fullWidth
              value={referencedPlannedEvent}
              disabled
              sx={{ ...modernInputStyle, mb: 2 }}
              margin="dense"
            />

            <TextField
              label="Estimated Time"
              type="datetime-local"
              fullWidth
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={modernInputStyle}
              margin="dense"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AccessTimeIcon
                      sx={{ color: TEXT_SECONDARY, fontSize: 20 }}
                    />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Time Zone"
              fullWidth
              value={estimatedTimeZone}
              onChange={(e) => setEstimatedTimeZone(e.target.value)}
              sx={modernInputStyle}
              margin="dense"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LanguageIcon
                      sx={{ color: TEXT_SECONDARY, fontSize: 20 }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          {/* Additional Details */}
          <Box
            sx={{
              mb: 2.5,
              backgroundColor: CARD,
              borderRadius: "14px",
              p: 2,
              border: "1px solid rgba(15,23,42,0.06)",
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: TEXT_SECONDARY,
                letterSpacing: 0.7,
                mb: 2,
                textTransform: "uppercase",
              }}
            >
              Additional Details
            </Typography>

            <FormControl
              fullWidth
              sx={{ ...modernInputStyle, mb: 1 }}
              margin="dense"
            >
              <InputLabel>Reason Code</InputLabel>
              <Select
                value={reasonCode}
                label="Reason Code"
                onChange={(e) => {
                  setReasonCode(e.target.value);
                  setReasonDescription("");
                }}
                disabled={reasonsLoading}
              >
                {reasonOptions.map((r) => (
                  <MenuItem key={r.EvtReasonCode} value={r.EvtReasonCode}>
                    {r.Description}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {reasonsError && (
              <Typography
                variant="caption"
                sx={{ color: "red", display: "block", mb: 1 }}
              >
                {reasonsError}
              </Typography>
            )}

            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={3}
              value={reasonDescription}
              onChange={(e) => setReasonDescription(e.target.value)}
              sx={{
                ...modernInputStyle,
                "& .MuiOutlinedInput-root": {
                  ...modernInputStyle["& .MuiOutlinedInput-root"],
                  padding: "10px",
                },
              }}
              margin="dense"
              placeholder="Enter your description here..."
              InputProps={{
                startAdornment: (
                  <InputAdornment
                    position="start"
                    sx={{ alignSelf: "flex-start", mt: 0.5 }}
                  >
                    <NotesIcon
                      sx={{ color: TEXT_SECONDARY, fontSize: 20 }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </DialogContent>

        <Box
          sx={{
            px: 3,
            py: 2.5,
            backgroundColor: CARD,
            borderTop: "1px solid rgba(15,23,42,0.06)",
          }}
        >
          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
            <Button
              onClick={closeDialog}
              sx={{
                px: 3,
                py: 1,
                borderRadius: "10px",
                border: "1px solid rgba(15,23,42,0.12)",
                color: TEXT_SECONDARY,
                fontWeight: 500,
                textTransform: "none",
                backgroundColor: "#F7F8FC",
                "&:hover": {
                  backgroundColor: "#E4E7F1",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              startIcon={<CheckCircleIcon />}
              sx={{
                px: 3.5,
                py: 1,
                borderRadius: "10px",
                background:
                  "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
                color: "#fff",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "0 8px 18px rgba(25,118,210,0.35)",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)",
                  boxShadow: "0 10px 24px rgba(25,118,210,0.45)",
                },
              }}
            >
              Submit Report
            </Button>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
