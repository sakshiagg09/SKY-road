// src/components/ReportEventDialog.jsx
import React, { useState, useEffect } from "react";
import {
  Button,
  Menu,
  MenuItem,
  Dialog,
  DialogContent,
  TextField,
  Select,
  InputLabel,
  FormControl,
  Typography,
  Box,
  Divider,
  InputAdornment,
  Chip,
  Fade,
  Paper,
  IconButton,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

// Icons
import ReportOutlinedIcon from "@mui/icons-material/ReportOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EventIcon from "@mui/icons-material/Event";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LanguageIcon from "@mui/icons-material/Language";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import PersonIcon from "@mui/icons-material/Person";
import FlagIcon from "@mui/icons-material/Flag";
import NotesIcon from "@mui/icons-material/Notes";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export default function ReportEventDialog({
  selectedShipment = null,
  open: controlledOpen,
  mode: controlledMode,
  onClose: controlledOnClose,
  initialMode = "unplanned",
}) {
  const FoId = selectedShipment?.FoId || "";

  // COLOR PALETTE (aligned with ShipmentDetailsPage)
  const BG = "#EFF0F3";
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";
  const GREEN = "#2E7D32";

  const [menuAnchor, setMenuAnchor] = useState(null);
  const menuOpen = Boolean(menuAnchor);

  // internal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(initialMode);

  // form fields
  const [plannedEventCode, setPlannedEventCode] = useState("DEP");
  const [unplannedEvent, setUnplannedEvent] = useState("Delay");
  const [referencedPlannedEvent, setReferencedPlannedEvent] = useState("");
  const [actualBusinessTime, setActualBusinessTime] = useState(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d - tzOffset).toISOString().slice(0, 16);
  });
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [reportedBy, setReportedBy] = useState(
    "vaibhav.suryawanshi@nav-it.com"
  );
  const [priority, setPriority] = useState("Normal");
  const [notes, setNotes] = useState("Reported from mobile demo");

  // sync controlled props
  useEffect(() => {
    if (typeof controlledOpen === "boolean") setOpen(controlledOpen);
  }, [controlledOpen]);

  useEffect(() => {
    if (controlledMode) setMode(controlledMode);
  }, [controlledMode]);

  // handlers
  const handleMenuOpen = (e) => setMenuAnchor(e.currentTarget);
  const handleMenuClose = () => setMenuAnchor(null);

  const openDialog = (which) => {
    setMode(which);
    setOpen(true);
    handleMenuClose();
  };

  const closeDialog = () => {
    if (typeof controlledOnClose === "function") controlledOnClose();
    else setOpen(false);
  };

  const buildPayload = () => {
    const base = {
      FoId,
      ActualBusinessTime: new Date(actualBusinessTime).toISOString(),
      ActualBusinessTimeZone: timeZone,
      Longitude: longitude || null,
      Latitude: latitude || null,
      ReportedBy: reportedBy,
      Priority: priority,
      Notes: notes,
      ReferencedPlannedEvent: referencedPlannedEvent || null,
    };

    if (mode === "planned") {
      return { ...base, Type: "Planned", EventCode: plannedEventCode };
    }
    return { ...base, Type: "Unplanned", Event: unplannedEvent };
  };

  const handleSubmit = () => {
    const payload = buildPayload();
    console.log("Report payload (mock):", payload);
    alert("Event reported (mock). Check console for payload.");
    closeDialog();
  };

  const isOpen = typeof controlledOpen === "boolean" ? controlledOpen : open;

  // Flat modern input style using primary blue
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

  const priorityColors = {
    Low: { bg: "#E3F4E8", color: GREEN, icon: GREEN },
    Normal: { bg: "#FFF1DA", color: "#EA7600", icon: "#EA7600" },
    High: { bg: "#FDE4E4", color: "#D32F2F", icon: "#D32F2F" },
  };

  return (
    <>
      {/* Trigger Button (only when not controlled by parent) */}
      {typeof controlledOpen !== "boolean" && (
        <Box sx={{ display: "inline-block" }}>
          <Button
            variant="contained"
            onClick={handleMenuOpen}
            startIcon={<ReportOutlinedIcon />}
            endIcon={<ExpandMoreIcon />}
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
            Report Event
          </Button>

          <Menu
            anchorEl={menuAnchor}
            open={menuOpen}
            onClose={handleMenuClose}
            TransitionComponent={Fade}
            PaperProps={{
              elevation: 4,
              sx: {
                mt: 1.5,
                borderRadius: "12px",
                border: "1px solid rgba(0, 0, 0, 0.06)",
                overflow: "hidden",
              },
            }}
          >
            <MenuItem
              onClick={() => openDialog("planned")}
              sx={{
                py: 1.2,
                px: 2,
                "&:hover": {
                  backgroundColor: "rgba(25,118,210,0.06)",
                },
              }}
            >
              <EventIcon sx={{ mr: 2, color: PRIMARY }} />
              <Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ color: TEXT_PRIMARY }}
                >
                  Planned Event
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: TEXT_SECONDARY }}
                >
                  Schedule departure, arrival, etc.
                </Typography>
              </Box>
            </MenuItem>

            <Divider sx={{ my: 0.5 }} />

            <MenuItem
              onClick={() => openDialog("unplanned")}
              sx={{
                py: 1.2,
                px: 2,
                "&:hover": {
                  backgroundColor: "rgba(25,118,210,0.06)",
                },
              }}
            >
              <WarningAmberIcon sx={{ mr: 2, color: "#EA7600" }} />
              <Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ color: TEXT_PRIMARY }}
                >
                  Unplanned Event
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: TEXT_SECONDARY }}
                >
                  Report delays, incidents
                </Typography>
              </Box>
            </MenuItem>
          </Menu>
        </Box>
      )}

      {/* Dialog */}
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
        {/* Header */}
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
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {mode === "planned" ? (
                <EventIcon sx={{ color: "#fff", fontSize: 26 }} />
              ) : (
                <WarningAmberIcon sx={{ color: "#fff", fontSize: 26 }} />
              )}
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
                  {mode === "planned" ? "Scheduled Event" : "Exception Event"}
                </Typography>
                <Typography
                  sx={{
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: 700,
                    mt: 0.2,
                  }}
                >
                  {mode === "planned"
                    ? "Report Planned Event"
                    : "Report Unplanned Event"}
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

          {/* Freight ID */}
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

        {/* Content */}
        <DialogContent
          sx={{
            px: 3,
            py: 3,
            backgroundColor: BG,
          }}
        >
          {/* Event Selection Section */}
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
              {mode === "planned" ? (
                <EventIcon sx={{ fontSize: 16, color: PRIMARY }} />
              ) : (
                <WarningAmberIcon
                  sx={{ fontSize: 16, color: "#EA7600" }}
                />
              )}
              Event Details
            </Typography>

            {mode === "planned" ? (
              <>
                <FormControl
                  fullWidth
                  sx={{ ...modernInputStyle, mb: 2 }}
                  margin="dense"
                >
                  <InputLabel>Select Planned Event</InputLabel>
                  <Select
                    value={plannedEventCode}
                    label="Select Planned Event"
                    onChange={(e) => setPlannedEventCode(e.target.value)}
                  >
                    <MenuItem value="DEP">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Chip
                          label="DEP"
                          size="small"
                          sx={{
                            bgcolor: "#E0EBFF",
                            color: PRIMARY,
                            fontWeight: 600,
                          }}
                        />
                        <Typography sx={{ color: TEXT_PRIMARY }}>
                          Departure
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="ARR">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Chip
                          label="ARR"
                          size="small"
                          sx={{
                            bgcolor: "#E3F4E8",
                            color: GREEN,
                            fontWeight: 600,
                          }}
                        />
                        <Typography sx={{ color: TEXT_PRIMARY }}>
                          Arrival
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="POD">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Chip
                          label="POD"
                          size="small"
                          sx={{
                            bgcolor: "#FFF1DA",
                            color: "#EA7600",
                            fontWeight: 600,
                          }}
                        />
                        <Typography sx={{ color: TEXT_PRIMARY }}>
                          Proof of Delivery
                        </Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Referenced Planned Event (Optional)"
                  fullWidth
                  margin="dense"
                  value={referencedPlannedEvent}
                  onChange={(e) => setReferencedPlannedEvent(e.target.value)}
                  sx={modernInputStyle}
                  placeholder="Enter reference if applicable"
                />
              </>
            ) : (
              <>
                <FormControl
                  fullWidth
                  sx={{ ...modernInputStyle, mb: 2 }}
                  margin="dense"
                >
                  <InputLabel>Select Unplanned Event</InputLabel>
                  <Select
                    value={unplannedEvent}
                    label="Select Unplanned Event"
                    onChange={(e) => setUnplannedEvent(e.target.value)}
                  >
                    <MenuItem value="Delay">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Chip
                          label="⏱"
                          size="small"
                          sx={{
                            bgcolor: "#FDE4E4",
                            color: "#D32F2F",
                          }}
                        />
                        <Typography sx={{ color: TEXT_PRIMARY }}>
                          Delay
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="Accident">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Chip
                          label="⚠"
                          size="small"
                          sx={{
                            bgcolor: "#FDE4E4",
                            color: "#D32F2F",
                          }}
                        />
                        <Typography sx={{ color: TEXT_PRIMARY }}>
                          Accident
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="Customs Hold">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Chip
                          label="🛃"
                          size="small"
                          sx={{
                            bgcolor: "#FFF1DA",
                            color: "#EA7600",
                          }}
                        />
                        <Typography sx={{ color: TEXT_PRIMARY }}>
                          Customs Hold
                        </Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Referenced Planned Event (Optional)"
                  fullWidth
                  margin="dense"
                  value={referencedPlannedEvent}
                  onChange={(e) => setReferencedPlannedEvent(e.target.value)}
                  sx={modernInputStyle}
                  placeholder="Enter reference if applicable"
                />
              </>
            )}
          </Box>

          {/* Time Section: ALL FIELDS STACKED */}
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
              <AccessTimeIcon sx={{ fontSize: 16, color: PRIMARY }} />
              Time & Location
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                label="Actual Business Time"
                type="datetime-local"
                fullWidth
                value={actualBusinessTime}
                onChange={(e) => setActualBusinessTime(e.target.value)}
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
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
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

              <TextField
                label="Latitude"
                fullWidth
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                sx={modernInputStyle}
                margin="dense"
                placeholder="0.0000"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <MyLocationIcon
                        sx={{ color: TEXT_SECONDARY, fontSize: 20 }}
                      />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Longitude"
                fullWidth
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                sx={modernInputStyle}
                margin="dense"
                placeholder="0.0000"
              />
            </Box>
          </Box>

          {/* Metadata Section: ALL FIELDS STACKED */}
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
                display: "flex",
                alignItems: "center",
                gap: 1,
                textTransform: "uppercase",
              }}
            >
              <PersonIcon sx={{ fontSize: 16, color: PRIMARY }} />
              Reporter Details
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                label="Reported By"
                fullWidth
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                sx={modernInputStyle}
                margin="dense"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon
                        sx={{ color: TEXT_SECONDARY, fontSize: 20 }}
                      />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControl
                fullWidth
                sx={modernInputStyle}
                margin="dense"
              >
                <InputLabel>Priority</InputLabel>
                <Select
                  value={priority}
                  label="Priority"
                  onChange={(e) => setPriority(e.target.value)}
                  renderValue={(val) => (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <FlagIcon
                        sx={{
                          fontSize: 18,
                          color: priorityColors[val].icon,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 14,
                          color: TEXT_PRIMARY,
                        }}
                      >
                        {val}
                      </Typography>
                    </Box>
                  )}
                >
                  <MenuItem value="Low">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                      }}
                    >
                      <FlagIcon sx={{ fontSize: 18, color: GREEN }} />
                      <span>Low</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="Normal">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                      }}
                    >
                      <FlagIcon
                        sx={{ fontSize: 18, color: "#EA7600" }}
                      />
                      <span>Normal</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="High">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                      }}
                    >
                      <FlagIcon
                        sx={{ fontSize: 18, color: "#D32F2F" }}
                      />
                      <span>High</span>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Additional Notes"
                fullWidth
                multiline
                minRows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                sx={{
                  ...modernInputStyle,
                  "& .MuiOutlinedInput-root": {
                    ...modernInputStyle["& .MuiOutlinedInput-root"],
                    padding: "10px",
                  },
                }}
                margin="dense"
                placeholder="Add any relevant details about this event..."
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
          </Box>

          {/* Visual Priority Indicator */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1.25,
              borderRadius: "10px",
              backgroundColor: priorityColors[priority].bg,
              border: `1px solid ${alpha(priorityColors[priority].color, 0.4)}`,
            }}
          >
            <FlagIcon
              sx={{
                color: priorityColors[priority].icon,
                fontSize: 18,
              }}
            />
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: priorityColors[priority].color,
              }}
            >
              Priority: {priority}
            </Typography>
          </Box>
        </DialogContent>

        {/* Actions */}
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
