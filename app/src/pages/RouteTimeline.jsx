import React, { useEffect, useMemo, useState } from "react";
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
 * RouteTimeline.jsx
 *
 * Props:
 *  - selectedShipment: { stops: Array, raw?, FoId? }
 *  - onAction?: (action: string, payload: any) => void
 *  - eventsUrl?: string (POST target)
 *
 * Behavior highlights:
 *  - Badge label derived from incoming stop.event when present (DEPART* -> Departure, ARRIV* -> Arrival, POD -> POD)
 *  - Completed stops are green; not completed are blue.
 *  - Actions are disabled & labeled "Reported" when already reported (seeded from payload or after successful POST).
 *  - Sequential reporting enforced (only next pending stop is actionable).
 *  - Progress computed from completed stops and reported upstream via onAction("progress", percent).
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
  const [itemsLoading, setItemsLoading] = useState(false);

  // reported actions per stop (in-memory). Seeded from payload.events if present.
  // shape: { [stopKey]: { arrival?: true, departure?: true, pod?: true, items?: true } }
  const [reportedActions, setReportedActions] = useState({});

  if (!selectedShipment || !Array.isArray(selectedShipment.stops) || selectedShipment.stops.length === 0) {
    return (
      <div style={{ padding: 12 }}>
        <Typography variant="body2" sx={{ color: TEXT_SECONDARY }}>
          No stops available
        </Typography>
      </div>
    );
  }

  const { stops: rawStops = [], FoId } = selectedShipment;

  // Normalize stops to stable property names
  const normalizedStops = useMemo(() => {
    return rawStops.map((s, idx) => {
      const stop = { ...s };
      stop.stopid = s.stopId ?? s.stopid ?? s.StopId ?? String(idx);
      stop.locid = s.locId ?? s.locid ?? s.LocId ?? stop.stopid;
      stop.stopseqpos = (s.stopSeqPos ?? s.stopseqpos ?? "").toString().toUpperCase();
      stop.dateTime = s.dateTime ?? s.dateTimeString ?? s.plannedDateTime ?? s.PlannedDepDate ?? s.dateTime;
      stop.name1 = s.name ?? s.name1 ?? "";
      stop.postCode1 = s.postCode ?? s.postCode1 ?? "";
      stop.city1 = s.city ?? s.city1 ?? "";
      stop.region = s.region ?? "";
      stop.country = s.country ?? "";
      stop.street = s.street ?? "";
      stop.latitude = s.latitude ?? s.Latitude;
      stop.longitude = s.longitude ?? s.Longitude;
      stop.event = s.event ?? s.Event ?? "";
      stop.materialLoad = s.materialLoad ?? s.materialLoadQty ?? s.loadQty ?? s.load ?? 0;
      stop.materialUnload = s.materialUnload ?? s.materialUnloadQty ?? s.unloadQty ?? s.unload ?? 0;
      return stop;
    });
  }, [rawStops]);

  // Seed reportedActions from incoming payload events (called once when normalizedStops changes)
  useEffect(() => {
    const seeded = {};
    normalizedStops.forEach((s, index) => {
      const key = s.stopid || s.locid || String(index);
      const evRaw = (s.event ?? "").toString().trim();
      const ev = evRaw ? evRaw.toUpperCase() : "";
      if (!ev) return;
      seeded[key] = seeded[key] || {};
      if (ev.includes("DEPART")) seeded[key].departure = true;
      if (ev.includes("ARRIV")) seeded[key].arrival = true;
      if (ev.includes("POD")) seeded[key].pod = true;
      // any known event but not matched -> mark departure as default completion flag
      if (!seeded[key].departure && !seeded[key].arrival && !seeded[key].pod) {
        seeded[key].departure = true;
      }
    });
    setReportedActions(seeded);
  }, [normalizedStops]);

  // date helper & formatting
  const parseDate = (val) => {
    if (!val) return null;
    const s = String(val).trim();
    const d = new Date(s);
    if (!isNaN(d)) return d;
    if (/^\d{14}$/.test(s)) {
      const yyyy = Number(s.slice(0, 4));
      const mm = Number(s.slice(4, 6));
      const dd = Number(s.slice(6, 8));
      const hh = Number(s.slice(8, 10));
      const min = Number(s.slice(10, 12));
      const ss = Number(s.slice(12, 14));
      const ddObj = new Date(yyyy, mm - 1, dd, hh, min, ss);
      return isNaN(ddObj) ? null : ddObj;
    }
    return null;
  };

  const formatDateTime = (d) => {
    if (!d) return "-";
    const date = d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    return `${date}, ${time}`;
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

  const readLoad = (stop) => Number(stop?.materialLoad ?? 0) || 0;
  const readUnload = (stop) => Number(stop?.materialUnload ?? 0) || 0;

  // sort stops by date/time (stable)
  const sortedStops = useMemo(() => {
    return [...normalizedStops].sort((a, b) => {
      const ta = parseDate(a.dateTime)?.getTime() ?? 0;
      const tb = parseDate(b.dateTime)?.getTime() ?? 0;
      return ta - tb;
    });
  }, [normalizedStops]);

  // derive load/unload display (first two load, rest unload; fallback unload = remaining)
  const derivedStops = useMemo(() => {
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
        displayLoad = baseLoad || 0;
        displayUnload = 0;
      } else {
        if (baseUnload > 0) displayUnload = baseUnload;
        else displayUnload = Math.max(0, totalLoaded - totalUnloaded);
        displayLoad = 0;
      }
      totalLoaded += displayLoad;
      totalUnloaded += displayUnload;
      out.push({ ...s, displayLoad, displayUnload });
    }
    return out;
  }, [sortedStops]);

  // compute completed count (a stop is completed if arrival or departure reported)
  const completedCount = useMemo(() => {
    let c = 0;
    for (let i = 0; i < derivedStops.length; i++) {
      const s = derivedStops[i];
      const key = s.stopid || s.locid || String(i);
      const actions = reportedActions[key] || {};
      if (actions.departure || actions.arrival) c++;
    }
    return c;
  }, [derivedStops, reportedActions]);

  const progressPercent = useMemo(() => {
    const total = Math.max(1, derivedStops.length);
    return Math.round((completedCount / total) * 100);
  }, [derivedStops.length, completedCount]);

  // notify parent about progress
  useEffect(() => {
    if (typeof onAction === "function") onAction("progress", progressPercent);
  }, [progressPercent, onAction]);

  // next pending index: first stop with neither arrival nor departure reported
  const nextPendingIndex = useMemo(() => {
    for (let i = 0; i < derivedStops.length; i++) {
      const s = derivedStops[i];
      const key = s.stopid || s.locid || String(i);
      const actions = reportedActions[key] || {};
      if (!(actions.departure || actions.arrival)) return i;
    }
    return derivedStops.length;
  }, [derivedStops, reportedActions]);

  // Menu handlers
  const handleMenuOpen = (event, stopKey) => {
    setAnchorEl(event.currentTarget);
    setActiveStopKey(stopKey);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveStopKey(null);
  };

  // send event to eventsUrl (ARRV/DEPT)
  const sendEventReport = async (actionCode, stopKey, stop) => {
    const payload = { FoId: FoId, Action: actionCode, StopId: stop.locid || stop.stopid || stopKey };
    const key = `${stopKey}_${actionCode}`;
    try {
      setSending((prev) => ({ ...prev, [key]: true }));
      const res = await fetch(eventsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(`Failed to report event (${actionCode}) — server returned ${res.status}`);
        return { ok: false, status: res.status, text };
      }
      // mark reported locally
      setReportedActions((prev) => {
        const copy = { ...prev };
        copy[stopKey] = { ...(copy[stopKey] || {}) };
        if (actionCode === "ARRV") copy[stopKey].arrival = true;
        else if (actionCode === "DEPT") copy[stopKey].departure = true;
        else copy[stopKey][actionCode.toLowerCase()] = true;
        return copy;
      });
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

  // fetch Items for stop and mark items reported (so the action becomes "viewable" afterwards)
  const fetchItemsForStop = async (stop) => {
    const location = stop.locid || stop.stopid || "";
    if (!location || !FoId) {
      setItemsStop(stop);
      setShowItems(true);
      return;
    }
    setItemsLoading(true);
    try {
      const url = `/sap/opu/odata/SAP/ZSKY_SRV/ItemsSet(Location='${encodeURIComponent(location)}',FoId='${encodeURIComponent(FoId)}')`;
      const res = await fetch(url);
      if (!res.ok) {
        alert("Failed to load items for this stop.");
        setItemsStop({ ...stop, items: [] });
        setShowItems(true);
        return;
      }
      const json = await res.json();
      let items = [];
      if (Array.isArray(json.value)) items = json.value;
      else if (Array.isArray(json.d?.results)) items = json.d.results;
      else if (Array.isArray(json.results)) items = json.results;
      else items = Array.isArray(json) ? json : [];
      setItemsStop({ ...stop, items });
      setShowItems(true);
      // mark items as reported/seen locally
      const stopKey = stop.stopid || stop.locid || String(derivedStops.indexOf(stop));
      setReportedActions((prev) => ({ ...prev, [stopKey]: { ...(prev[stopKey] || {}), items: true } }));
    } catch (err) {
      alert("Failed to load items for this stop.");
      setItemsStop({ ...stop, items: [] });
      setShowItems(true);
    } finally {
      setItemsLoading(false);
    }
  };

  const handleAction = async (action) => {
    handleMenuClose();
    const stopIndex = derivedStops.findIndex((s, idx) => {
      const key = s.stopid || s.locid || String(idx);
      return key === activeStopKey;
    });
    if (stopIndex === -1) {
      console.warn("stop not found for action", action, activeStopKey);
      return;
    }
    // enforce sequential rule unless the action is already reported
    if (stopIndex !== nextPendingIndex) {
      alert("You must report events in order. Please report the next stop first.");
      return;
    }
    const stop = derivedStops[stopIndex];
    const stopKey = stop.stopid || stop.locid || String(stopIndex);
    const actionsForStop = reportedActions[stopKey] || {};

    if (action === "items") {
      if (actionsForStop.items) {
        setItemsStop(stop);
        setShowItems(true);
        return;
      }
      await fetchItemsForStop(stop);
      if (typeof onAction === "function") onAction("items", { stop, FoId });
      return;
    }

    if (action === "pod") {
      // mark pod locally and forward to parent
      setReportedActions((prev) => ({ ...prev, [stopKey]: { ...(prev[stopKey] || {}), pod: true } }));
      if (typeof onAction === "function") onAction("pod", stop);
      return;
    }

    if (action === "arrival" || action === "departure") {
      const code = action === "arrival" ? "ARRV" : "DEPT";
      const sendingKey = `${stopKey}_${code}`;
      if (sending[sendingKey]) return;
      const result = await sendEventReport(code, stopKey, stop);
      if (result.ok) {
        if (typeof onAction === "function") onAction(action, stop);
      }
      return;
    }

    if (typeof onAction === "function") onAction(action, stop);
  };

  // Items view
  if (showItems) {
    return (
      <MaterialItemList
        stop={itemsStop}
        loading={itemsLoading}
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

          // dynamic completion from reportedActions (seeded from payload event or from UI POSTS)
          const stopKey = stop.stopid || stop.locid || String(idx);
          const actionsForThisStop = reportedActions[stopKey] || {};
          const isCompleted = Boolean(actionsForThisStop.departure || actionsForThisStop.arrival);

          // badge label: prefer explicit payload event if present
          const ev = (stop.event ?? "").toString().toUpperCase();
          let explicitBadge = null;
          if (ev) {
            if (ev.includes("DEPART")) explicitBadge = "Departure";
            else if (ev.includes("ARRIV")) explicitBadge = "Arrival";
            else if (ev.includes("POD")) explicitBadge = "POD";
            else explicitBadge = ev; // fallback show raw
          }

          const meta = (() => {
            if (explicitBadge) {
              // prefer explicit event label
              return {
                label: isFirstTwo ? "Actual Reported At" : "Planned Arrival At",
                badge: explicitBadge,
                color: isCompleted ? GREEN : BLUE,
                icon: explicitBadge === "Departure" ? "truck" : "location",
                isCompleted,
              };
            }
            // fallback to sequence-driven badge (previous behavior)
            if (isFirstTwo) {
              return {
                label: "Actual Reported At",
                badge: (stop.stopseqpos || "").toUpperCase() === "F" ? "Departure" : "Arrival",
                color: isCompleted ? GREEN : BLUE,
                icon: (stop.stopseqpos || "").toUpperCase() === "F" ? "truck" : "location",
                isCompleted,
              };
            }
            return {
              label: "Planned Arrival At",
              badge: isLastTwo ? "ETA" : "Arrival",
              color: isCompleted ? GREEN : BLUE,
              icon: "location",
              isCompleted,
            };
          })();

          // timing display (same heuristics as before)
          const plannedDate = parseDate(stop.dateTime);
          const rawActual = stop.actualDateTime || stop.actualArrivalDateTime || null;
          const rawEta = stop.etaDateTime || stop.estimatedArrivalDateTime || stop.eta || null;
          let actualDate = parseDate(rawActual);
          let etaDate = parseDate(rawEta);

          if (isFirstTwo && !actualDate && plannedDate) {
            actualDate = addMinutes(plannedDate, (idx + 1) * 5);
          }
          if (isLastTwo && !etaDate && plannedDate) {
            etaDate = addMinutes(plannedDate, (idx + 1) * 10);
          }

          const plannedText = formatDateTime(plannedDate);
          const actualText = formatDateTime(actualDate);
          const etaText = formatDateTime(etaDate);

          const address = buildAddress(stop);
          const RIGHT_BOX_WIDTH = 62;

          const materialLoad = Number(stop.displayLoad ?? stop.materialLoad ?? 0) || 0;
          const materialUnload = Number(stop.displayUnload ?? stop.materialUnload ?? 0) || 0;

          // build menu options by sequence (unchanged) — we will disable items already reported and show 'Reported' in secondary text
          const menuOptions = (() => {
            const seq = (stop.stopseqpos || "").toUpperCase();
            const itemsOpt = { key: "items", label: "Items", Icon: Inventory2OutlinedIcon };
            const arrivalOpt = { key: "arrival", label: "Arrival", Icon: EventAvailableIcon };
            const podOpt = { key: "pod", label: "Proof of Delivery", Icon: AssignmentTurnedInIcon };
            const departureOpt = { key: "departure", label: "Departure", Icon: LocalShippingIcon };

            if (seq === "F") return [itemsOpt, departureOpt];
            if (seq === "I") return [itemsOpt, arrivalOpt, podOpt, departureOpt];
            if (seq === "L") return [itemsOpt, podOpt, departureOpt];
            return [itemsOpt, arrivalOpt, departureOpt, podOpt];
          })();

          // enable action only if this is the next pending stop OR the action is already reported (so users can view)
          const isNextPending = idx === nextPendingIndex;

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
                    <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#ffffff" }} />
                  ) : meta.icon === "truck" ? (
                    <LocalShippingIcon sx={{ fontSize: 18, color: meta.color }} />
                  ) : (
                    <LocationOnIcon sx={{ fontSize: 18, color: meta.color }} />
                  )}
                </div>

                {idx !== derivedStops.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      background: "linear-gradient(to bottom, #e2e8f0, transparent)",
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
                  <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                    {stop.name1 ? `${stop.name1} (${stop.locid || stop.stopid || "-"})` : `${stop.locid || stop.stopid || "-"}`}
                  </p>

                  {/* timing rows */}
                  {isFirstTwo ? (
                    <>
                      <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>
                        Actual Reported At
                      </p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>
                        {actualText}
                      </p>

                      <p className="text-[12px] mt-2" style={{ color: TEXT_SECONDARY }}>
                        Planned Arrival
                      </p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>
                        {plannedText}
                      </p>
                    </>
                  ) : isLastTwo ? (
                    <>
                      <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>
                        Planned Arrival
                      </p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>
                        {plannedText}
                      </p>

                      <p className="text-[12px] mt-2" style={{ color: TEXT_SECONDARY }}>
                        Estimated Arrival
                      </p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>
                        {etaText}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>
                        Planned Arrival
                      </p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>
                        {plannedText}
                      </p>
                    </>
                  )}

                  <div style={{ marginTop: 8, color: TEXT_SECONDARY, fontSize: 13 }}>
                    {isFirstTwo ? <div>Material Load : {materialLoad} Packages</div> : <div>Material Unload : {materialUnload} Packages</div>}
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
                    <LocationOnIcon sx={{ fontSize: 18, color: meta.color, marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" sx={{ color: TEXT_SECONDARY, display: "block" }}>
                        Address
                      </Typography>
                      <Typography variant="body2" sx={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 13, whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                        {address}
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
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${meta.color}15`, color: meta.color, display: "inline-block" }}>
                      {meta.badge}
                    </span>
                  </div>
                  <div style={{ pointerEvents: "auto" }}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, stopKey)}
                      aria-controls={menuOpen && activeStopKey === stopKey ? `stop-menu-${stopKey}` : undefined}
                      aria-haspopup="true"
                      aria-expanded={menuOpen && activeStopKey === stopKey ? "true" : undefined}
                      sx={{
                        bgcolor: "#fafafa",
                        borderRadius: 1,
                        padding: 0.5,
                        "&:hover": { bgcolor: "#f0f0f0" },
                        boxShadow: "0 1px 3px rgba(16,24,40,0.06)",
                      }}
                    >
                      <MoreVertIcon sx={{ fontSize: 18, color: "#6b6c6e" }} />
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
                <Box sx={{ px: 1.25, py: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip label={meta.badge} size="small" sx={{ backgroundColor: `${meta.color}20`, color: meta.color, fontWeight: 600, height: 26, borderRadius: 1 }} />
                  <Typography variant="body2" sx={{ color: TEXT_SECONDARY, fontSize: 13 }}>
                    Actions
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />

                {menuOptions.map((opt) => {
                  const Icon = opt.Icon;
                  const key = `${stopKey}_${opt.key}`;
                  const alreadyReported = Boolean(actionsForThisStop[opt.key]);
                  const codeForNetwork = opt.key === "arrival" ? "ARRV" : opt.key === "departure" ? "DEPT" : opt.key;
                  const isSending =
                    (opt.key === "arrival" || opt.key === "departure") &&
                    Boolean(sending[`${stopKey}_${codeForNetwork}`]);

                  // enable only if this stop is the next pending one OR if the option was already reported (allow view)
                  const enabled = isNextPending || alreadyReported;

                  return (
                    <MenuItem
                      key={opt.key}
                      onClick={() => {
                        if (!enabled && !alreadyReported) {
                          alert("Please report stops in order. This action is not yet available.");
                          return;
                        }
                        if (alreadyReported) {
                          // show read-only behavior for reported items
                          if (opt.key === "items") {
                            setItemsStop(stop);
                            setShowItems(true);
                          } else if (opt.key === "pod") {
                            if (typeof onAction === "function") onAction("pod", stop);
                          } else {
                            alert("This event was already reported.");
                          }
                          handleMenuClose();
                          return;
                        }
                        handleAction(opt.key);
                      }}
                      disabled={isSending || (!enabled && !alreadyReported)}
                    >
                      <ListItemIcon sx={{ minWidth: 34 }}>
                        <Icon fontSize="small" sx={{ color: PRIMARY }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>{opt.label}</Typography>}
                        secondary={
                          isSending ? (
                            <Typography variant="caption" sx={{ color: TEXT_SECONDARY }}>Sending…</Typography>
                          ) : alreadyReported ? (
                            <Typography variant="caption" sx={{ color: TEXT_SECONDARY }}>Reported</Typography>
                          ) : opt.key === "pod" ? (
                            <Typography variant="caption" sx={{ color: TEXT_SECONDARY }}>Record POD</Typography>
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
