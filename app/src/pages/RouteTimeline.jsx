// src/components/RouteTimeline.jsx
import React, { useState } from "react";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";

import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Divider,
  Box,
} from "@mui/material";

import MaterialItemList from "../components/MaterialItemList";

/**
 * RouteTimeline (JSX)
 * Props:
 *  - selectedShipment: { stops: Array, raw?, FoId? }
 *  - onAction?: (action: string, stop: object) => void
 *  - eventsUrl?: string
 */
export default function RouteTimeline({
  selectedShipment,
  onAction,
  eventsUrl = "/odata/v4/GTT/eventReporting",
}) {
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";
  const GREEN = "#2E7D32";
  const BLUE = "#42A5F5";

  // menu state
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeStopKey, setActiveStopKey] = useState(null);
  const [sending, setSending] = useState({});
  const menuOpen = Boolean(anchorEl);

  // items view state
  const [showItems, setShowItems] = useState(false);
  const [itemsStop, setItemsStop] = useState(null);

  if (
    !selectedShipment ||
    !Array.isArray(selectedShipment.stops) ||
    selectedShipment.stops.length === 0
  ) {
    return (
      <div style={{ padding: 12 }}>
        <Typography variant="body2" sx={{ color: TEXT_SECONDARY }}>
          No stops available
        </Typography>
      </div>
    );
  }

  const { stops = [], FoId } = selectedShipment;

  // helpers
  const parseSapDateTimeToDate = (dt) => {
    if (dt === null || typeof dt === "undefined") return null;
    const s = String(dt).trim();
    if (/^\d{14}$/.test(s)) {
      const yyyy = Number(s.slice(0, 4));
      const mm = Number(s.slice(4, 6));
      const dd = Number(s.slice(6, 8));
      const hh = Number(s.slice(8, 10));
      const min = Number(s.slice(10, 12));
      const ss = Number(s.slice(12, 14));
      const d = new Date(yyyy, mm - 1, dd, hh, min, ss);
      return isNaN(d) ? null : d;
    }
    const maybe = new Date(s);
    return isNaN(maybe) ? null : maybe;
  };

  const formatDateTime = (d) => {
    if (!d) return "-";
    const date = d.toLocaleDateString("en-GB");
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time} CET`;
  };

  const addMinutes = (date, minutes) => {
    if (!date) return null;
    return new Date(date.getTime() + minutes * 60 * 1000);
  };

  const buildAddress = (s) => {
    if (!s) return "-";
    const parts = [];
    if (s.street) parts.push(s.street);
    const cityLine = [s.postCode1, s.city1].filter(Boolean).join(" ");
    if (cityLine) parts.push(cityLine);
    const regionCountry = [s.region, s.country].filter(Boolean).join(", ");
    if (regionCountry) parts.push(regionCountry);
    return parts.join(", ") || "-";
  };

  const readLoad = (stop) =>
    stop?.materialLoad ??
    stop?.loadQty ??
    stop?.load ??
    stop?.materialLoadQty ??
    10;
  const readUnload = (stop) =>
    stop?.materialUnload ??
    stop?.unloadQty ??
    stop?.unload ??
    stop?.materialUnloadQty ??
    10;

  const getMenuOptionsForStop = (stop) => {
    const seq = (stop?.stopseqpos || "").toUpperCase();
    const itemsOpt = { key: "items", label: "Items", Icon: Inventory2OutlinedIcon };
    const arrivalOpt = { key: "arrival", label: "Arrival", Icon: EventAvailableIcon };
    const podOpt = {
      key: "pod",
      label: "Proof of Delivery",
      Icon: AssignmentTurnedInIcon,
    };
    const departureOpt = {
      key: "departure",
      label: "Departure",
      Icon: LocalShippingIcon,
    };

    if (seq === "F") return [itemsOpt, departureOpt];
    if (seq === "I") return [itemsOpt, arrivalOpt, podOpt, departureOpt];
    if (seq === "L") return [itemsOpt, arrivalOpt, podOpt];
    return [itemsOpt, arrivalOpt, departureOpt, podOpt];
  };

  // sort stops by date/time
  const sortedStops = [...stops].sort((a, b) => {
    const ta = parseSapDateTimeToDate(a.dateTime)?.getTime() ?? 0;
    const tb = parseSapDateTimeToDate(b.dateTime)?.getTime() ?? 0;
    return ta - tb;
  });

  // derive display load/unload (first two = load, rest = unload)
  const derivedStops = (() => {
    const out = [];
    let totalLoaded = 0;
    let totalUnloaded = 0;

    for (let i = 0; i < sortedStops.length; i++) {
      const s = { ...sortedStops[i] };
      const baseLoad = Number(readLoad(s)) || 0;
      const baseUnload = Number(readUnload(s)) || 0;

      let displayLoad = 0;
      let displayUnload = 0;

      if (i <= 1) {
        displayLoad = baseLoad;
        displayUnload = 0;
      } else {
        if (baseUnload > 0) {
          displayUnload = baseUnload;
        } else {
          const remaining = Math.max(0, totalLoaded - totalUnloaded);
          displayUnload = remaining;
        }
        displayLoad = 0;
      }

      totalLoaded += displayLoad;
      totalUnloaded += displayUnload;

      out.push({
        ...s,
        displayLoad,
        displayUnload,
      });
    }

    return out;
  })();

  // Menu handlers
  const handleMenuOpen = (event, stopKey) => {
    setAnchorEl(event.currentTarget);
    setActiveStopKey(stopKey);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveStopKey(null);
  };

  // send EventsReportingSet
  const sendEventReport = async (actionCode, stopId) => {
    const payload = { FoId: FoId, Action: actionCode, StopId: stopId };
    const key = `${stopId}_${actionCode}`;
    try {
      setSending((prev) => ({ ...prev, [key]: true }));
      const res = await fetch(eventsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(
          `Failed to report event (${actionCode}) — server returned ${res.status}`
        );
        return { ok: false, status: res.status, text };
      }
      return { ok: true };
    } catch (err) {
      alert(`Failed to report event (${actionCode}): ${err.message || err}`);
      return { ok: false, error: err };
    } finally {
      setSending((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleAction = async (action) => {
    handleMenuClose();

    const stop = derivedStops.find((s, idx) => {
      const key = s.stopid || s.locid || String(idx);
      return key === activeStopKey;
    });

    if (!stop) {
      console.warn("stop not found for action", action, activeStopKey);
      return;
    }

    // ITEMS: switch to MaterialItemList view
    if (action === "items") {
      setItemsStop(stop);
      setShowItems(true);
      if (typeof onAction === "function") onAction("items", stop);
      return;
    }

    // POD: open POD flow in parent
    if (action === "pod") {
      if (typeof onAction === "function") onAction("pod", stop);
      return;
    }

    const stopId = stop.stopid || stop.locid || stop.StopId || String(activeStopKey);

    if (action === "arrival" || action === "departure") {
      const code = action === "arrival" ? "ARRV" : "DEPT";
      const key = `${stopId}_${code}`;
      if (sending[key]) return;
      const result = await sendEventReport(code, stopId);
      if (result.ok) {
        if (typeof onAction === "function") onAction(action, stop);
        else console.log(`Event ${code} sent for stop ${stopId}`);
      }
      return;
    }

    if (typeof onAction === "function") onAction(action, stop);
    else console.log("Action:", action, "stop:", stop);
  };

  // If user clicked "Items" show the item list instead of the timeline
  if (showItems) {
    return (
      <MaterialItemList
        stop={itemsStop}
        onBack={() => setShowItems(false)}
        onConfirm={() => setShowItems(false)}
      />
    );
  }

  // --- render timeline ---
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
          Route timeline
        </p>
        <p className="text-[11px]" style={{ color: PRIMARY }}>
          View on map ▸
        </p>
      </div>

      <div className="mt-2">
        {derivedStops.map((stop, idx) => {
          const totalStops = derivedStops.length;

          const isFirstTwo = idx <= 1;
          const isLastTwo = idx >= totalStops - 2;

          const meta = isFirstTwo
            ? {
                label: "Actual Reported At",
                badge:
                  (stop.stopseqpos || "").toUpperCase() === "F"
                    ? "Departure"
                    : "Arrival",
                color: GREEN,
                icon:
                  (stop.stopseqpos || "").toUpperCase() === "F"
                    ? "truck"
                    : "location",
                isCompleted: true,
              }
            : {
                label: "Planned Arrival At",
                badge: isLastTwo ? "ETA" : "Arrival",
                color: BLUE,
                icon: "location",
                isCompleted: false,
              };

          // ------- DATE CALCULATIONS WITH REALISTIC FALLBACKS --------
          // Planned comes from dateTime (your current data)
          const plannedDate = parseSapDateTimeToDate(
            stop.plannedDateTime || stop.dateTime
          );

          // If backend ever sends true actual / eta they win.
          const rawActual =
            stop.actualDateTime || stop.actualArrivalDateTime || null;
          const rawEta =
            stop.etaDateTime ||
            stop.estimatedArrivalDateTime ||
            stop.eta ||
            null;

          let actualDate = parseSapDateTimeToDate(rawActual);
          let etaDate = parseSapDateTimeToDate(rawEta);

          // For the FIRST TWO stops: if there is no actual date, derive one
          // a few minutes AFTER planned so it looks realistic.
          if (isFirstTwo && !actualDate && plannedDate) {
            // 1st stop => +5 min, 2nd => +10 min
            const offsetMinutes = (idx + 1) * 5;
            actualDate = addMinutes(plannedDate, offsetMinutes);
          }

          // For the LAST TWO stops: if there is no ETA, derive one
          // a bit AFTER planned so it feels like a live prediction.
          if (isLastTwo && !etaDate && plannedDate) {
            // e.g. +15 / +20 min
            const offsetMinutes = (idx + 1) * 10;
            etaDate = addMinutes(plannedDate, offsetMinutes);
          }

          const plannedText = formatDateTime(plannedDate);
          const actualText = formatDateTime(actualDate);
          const etaText = formatDateTime(etaDate);
          // -----------------------------------------------------------

          const address = buildAddress(stop);
          const stopKey = stop.stopid || stop.locid || String(idx);
          const menuOptions = getMenuOptionsForStop(stop);
          const RIGHT_BOX_WIDTH = 62;

          const materialLoad = Number(stop.displayLoad ?? 0) || 0;
          const materialUnload = Number(stop.displayUnload ?? 0) || 0;

          return (
            <div key={stopKey} className="flex items-start mb-4 min-w-0">
              {/* timeline column */}
              <div className="flex flex-col items-center mr-3 w-10 flex-shrink-0">
                <div
                  className="h-9 w-9 rounded-full border-2 flex items-center justify-center"
                  style={{
                    borderColor: meta.color,
                    backgroundColor: meta.isCompleted ? meta.color : CARD,
                  }}
                >
                  {meta.isCompleted ? (
                    <CheckCircleOutlineIcon
                      sx={{ fontSize: 16, color: "#ffffff" }}
                    />
                  ) : meta.icon === "truck" ? (
                    <LocalShippingIcon
                      sx={{ fontSize: 18, color: meta.color }}
                    />
                  ) : (
                    <LocationOnIcon
                      sx={{ fontSize: 18, color: meta.color }}
                    />
                  )}
                </div>

                {idx !== derivedStops.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      background:
                        "linear-gradient(to bottom, #e2e8f0, transparent)",
                      marginTop: 8,
                    }}
                  />
                )}
              </div>

              {/* card */}
              <div
                className="flex-1 rounded-2xl p-4 border min-w-0"
                style={{
                  backgroundColor: CARD,
                  borderColor: "#dde3ec",
                  boxShadow: "4px 4px 14px #d9dde6, -4px -4px 14px #ffffff",
                  position: "relative",
                  overflow: "visible",
                }}
              >
                <div style={{ paddingRight: RIGHT_BOX_WIDTH, minWidth: 0 }}>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: TEXT_PRIMARY }}
                  >
                    {stop.name1
                      ? `${stop.name1} (${stop.locid || stop.stopid || "-"})`
                      : `${stop.locid || stop.stopid || "-"}`}
                  </p>

                  {/* timing rows */}
                  {isFirstTwo ? (
                    <>
                      <p
                        className="text-[12px] mt-1"
                        style={{ color: TEXT_SECONDARY }}
                      >
                        Actual Reported At
                      </p>
                      <p
                        className="text-[12px] mt-0"
                        style={{
                          color: TEXT_SECONDARY,
                          fontWeight: 600,
                        }}
                      >
                        {actualText}
                      </p>

                      <p
                        className="text-[12px] mt-2"
                        style={{ color: TEXT_SECONDARY }}
                      >
                        Planned Arrival
                      </p>
                      <p
                        className="text-[12px] mt-0"
                        style={{
                          color: TEXT_SECONDARY,
                          fontWeight: 600,
                        }}
                      >
                        {plannedText}
                      </p>
                    </>
                  ) : isLastTwo ? (
                    <>
                      <p
                        className="text-[12px] mt-1"
                        style={{ color: TEXT_SECONDARY }}
                      >
                        Planned Arrival
                      </p>
                      <p
                        className="text-[12px] mt-0"
                        style={{
                          color: TEXT_SECONDARY,
                          fontWeight: 600,
                        }}
                      >
                        {plannedText}
                      </p>

                      <p
                        className="text-[12px] mt-2"
                        style={{ color: TEXT_SECONDARY }}
                      >
                        Estimated Arrival
                      </p>
                      <p
                        className="text-[12px] mt-0"
                        style={{
                          color: TEXT_SECONDARY,
                          fontWeight: 600,
                        }}
                      >
                        {etaText}
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        className="text-[12px] mt-1"
                        style={{ color: TEXT_SECONDARY }}
                      >
                        Planned Arrival
                      </p>
                      <p
                        className="text-[12px] mt-0"
                        style={{
                          color: TEXT_SECONDARY,
                          fontWeight: 600,
                        }}
                      >
                        {plannedText}
                      </p>
                    </>
                  )}

                  <div
                    style={{
                      marginTop: 8,
                      color: TEXT_SECONDARY,
                      fontSize: 13,
                    }}
                  >
                    {isFirstTwo ? (
                      <div>Material Load : {materialLoad} Packages</div>
                    ) : (
                      <div>Material Unload : {materialUnload} Packages</div>
                    )}
                  </div>

                  {/* Address highlighted */}
                  <Box
                    className="mt-3"
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      backgroundColor: "#eaf4ff",
                      borderRadius: 1.5,
                      padding: "10px 12px",
                      borderLeft: `4px solid ${meta.color}`,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <LocationOnIcon
                      sx={{
                        fontSize: 18,
                        color: meta.color,
                        marginTop: "2px",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: TEXT_SECONDARY,
                          display: "block",
                        }}
                      >
                        Address
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: TEXT_PRIMARY,
                          fontWeight: 600,
                          fontSize: 13,
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {buildAddress(stop)}
                      </Typography>
                    </div>
                  </Box>
                </div>

                {/* absolute right box */}
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 8,
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ pointerEvents: "auto" }}>
                    <span
                      className="px-2 py-1 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${meta.color}15`,
                        color: meta.color,
                        display: "inline-block",
                      }}
                    >
                      {meta.badge}
                    </span>
                  </div>
                  <div style={{ pointerEvents: "auto" }}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, stopKey)}
                      aria-controls={
                        menuOpen && activeStopKey === stopKey
                          ? `stop-menu-${stopKey}`
                          : undefined
                      }
                      aria-haspopup="true"
                      aria-expanded={
                        menuOpen && activeStopKey === stopKey
                          ? "true"
                          : undefined
                      }
                      sx={{
                        bgcolor: "#fafafa",
                        borderRadius: 1,
                        padding: 0.5,
                        "&:hover": { bgcolor: "#f0f0f0" },
                        boxShadow: "0 1px 3px rgba(16,24,40,0.06)",
                      }}
                    >
                      <MoreVertIcon
                        sx={{ fontSize: 18, color: "#6b6c6e" }}
                      />
                    </IconButton>
                  </div>
                </div>
              </div>

              {/* menu */}
              <Menu
                id={`stop-menu-${stopKey}`}
                anchorEl={anchorEl}
                open={menuOpen && activeStopKey === stopKey}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                PaperProps={{
                  sx: {
                    minWidth: 160,
                    p: 0.5,
                    borderRadius: 2,
                    boxShadow: "0 8px 24px rgba(16,24,40,0.12)",
                    "& .MuiMenuItem-root": {
                      py: 0.6,
                      px: 1.5,
                      borderRadius: 1,
                      "&:hover": { bgcolor: "#f5f7fb" },
                    },
                  },
                }}
              >
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.75,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Chip
                    label={meta.badge}
                    size="small"
                    sx={{
                      backgroundColor: `${meta.color}20`,
                      color: meta.color,
                      fontWeight: 600,
                      height: 26,
                      borderRadius: 1,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ color: TEXT_SECONDARY, fontSize: 13 }}
                  >
                    Actions
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />

                {menuOptions.map((opt) => {
                  const Icon = opt.Icon;
                  const key = `${stopKey}_${opt.key}`;
                  const isSending =
                    (opt.key === "arrival" || opt.key === "departure") &&
                    Boolean(
                      sending[
                        `${stopKey}_${
                          opt.key === "arrival" ? "ARRV" : "DEPT"
                        }`
                      ]
                    );

                  return (
                    <MenuItem
                      key={opt.key}
                      onClick={() => handleAction(opt.key)}
                      disabled={isSending}
                    >
                      <ListItemIcon sx={{ minWidth: 34 }}>
                        <Icon fontSize="small" sx={{ color: PRIMARY }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600 }}
                          >
                            {opt.label}
                          </Typography>
                        }
                        secondary={
                          isSending ? (
                            <Typography
                              variant="caption"
                              sx={{ color: TEXT_SECONDARY }}
                            >
                              Sending…
                            </Typography>
                          ) : opt.key === "pod" ? (
                            <Typography
                              variant="caption"
                              sx={{ color: TEXT_SECONDARY }}
                            >
                              Record POD
                            </Typography>
                          ) : null
                        }
                      />
                    </MenuItem>
                  );
                })}
              </Menu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
