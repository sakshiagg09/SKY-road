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
 * RouteTimeline — updated badge logic to prefer runtime reportedMap state
 * and otherwise fall back to stop.eventRaw / sequence.
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

  // items view
  const [showItems, setShowItems] = useState(false);
  const [itemsStop, setItemsStop] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);

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

  // ----------------- helpers -----------------
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
    const cityLine = [s.postCode1 ?? s.postCode, s.city1 ?? s.city].filter(Boolean).join(" ");
    if (cityLine) parts.push(cityLine);
    const regionCountry = [s.region, s.country].filter(Boolean).join(", ");
    if (regionCountry) parts.push(regionCountry);
    return parts.join(", ") || "-";
  };

  // normalize stops to stable fields
  const stops = useMemo(
    () =>
      rawStops.map((s, idx) => ({
        idx,
        stopid: s.stopId ?? s.stopid ?? String(idx),
        locid: s.locId ?? s.locid ?? "",
        stopseqpos: (s.stopSeqPos ?? s.stopseqpos ?? "").toString().toUpperCase(),
        dateTime: parseSapDateTimeToDate(s.dateTime ?? s.dateTimeString ?? s.dateTime),
        name1: s.name1 ?? s.name ?? "",
        street: s.street ?? "",
        postCode1: s.postCode1 ?? s.postCode ?? "",
        city1: s.city1 ?? s.city ?? "",
        region: s.region ?? "",
        country: s.country ?? "",
        typeLoc: (s.typeLoc ?? s.typeLoc ?? s.locationType ?? "").toString(),
        eventRaw: (s.event ?? s.Event ?? "") || "",
        materialLoad: Number(s.materialLoad ?? s.materialLoadQty ?? s.loadQty ?? s.load ?? 0) || 0,
        materialUnload: Number(s.materialUnload ?? s.materialUnloadQty ?? s.unloadQty ?? s.unload ?? 0) || 0,
      })),
    [rawStops]
  );

  // derive display load/unload (first two = load, rest = unload)
  const derivedStops = useMemo(() => {
    const out = [];
    let totalLoaded = 0;
    let totalUnloaded = 0;
    const sorted = [...stops].sort((a, b) => (a.dateTime?.getTime() ?? 0) - (b.dateTime?.getTime() ?? 0));
    for (let i = 0; i < sorted.length; i++) {
      const s = { ...sorted[i] };
      const baseLoad = Number(s.materialLoad) || 0;
      const baseUnload = Number(s.materialUnload) || 0;
      let displayLoad = 0;
      let displayUnload = 0;
      if (i <= 1) {
        displayLoad = baseLoad;
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
  }, [stops]);

  // reportedMap seeded from stop.event (FinalInfo.event)
  // shape: { stopKey: { arrival: true, departure: true, pod: true, items: true } }
  const [reportedMap, setReportedMap] = useState(() => {
    const m = {};
    derivedStops.forEach((s) => {
      const key = s.stopid || s.locid || String(s.idx);
      const ev = (s.eventRaw ?? "").toString().trim().toUpperCase();
      if (!ev) return;
      m[key] = m[key] || {};
      if (ev.includes("DEPART")) m[key].departure = true;
      else if (ev.includes("ARRIV")) m[key].arrival = true;
      else if (ev.includes("POD")) m[key].pod = true;
      else if (ev.includes("DEPARTURE")) m[key].departure = true;
      else m[key].departure = true;
    });
    return m;
  });

  // completedCount and progress
  const completedCount = useMemo(
    () =>
      derivedStops.reduce((acc, s) => {
        const key = s.stopid || s.locid || String(s.idx);
        const r = reportedMap[key] || {};
        return acc + ((r.arrival || r.departure) ? 1 : 0);
      }, 0),
    [derivedStops, reportedMap]
  );

  const progressPercent = Math.round((completedCount / Math.max(1, derivedStops.length)) * 100);

  useEffect(() => {
    if (typeof onAction === "function") onAction("progress", progressPercent);
  }, [progressPercent, onAction]);

  // nextPendingIndex = first stop missing arrival or departure
  const nextPendingIndex = useMemo(() => {
    for (let i = 0; i < derivedStops.length; i++) {
      const s = derivedStops[i];
      const key = s.stopid || s.locid || String(s.idx);
      const r = reportedMap[key] || {};
      if (!(r.arrival || r.departure)) return i;
    }
    return derivedStops.length;
  }, [derivedStops, reportedMap]);

  // map server Event -> action key
  const mapServerEventToActionKey = (ev) => {
    if (!ev) return null;
    const e = String(ev).toUpperCase();
    if (e.includes("ARRIV")) return "arrival";
    if (e.includes("DEPART")) return "departure";
    if (e.includes("POD")) return "pod";
    return null;
  };

  // allowed sequence per stop (exact per your request)
  const allowedSequenceForStop = (stop) => {
    const seq = (stop.stopseqpos || "").toUpperCase();
    const typeLoc = (stop.typeLoc || "").toString().toLowerCase();
    if (seq === "F") return ["items", "departure"];
    if (seq === "I") {
      if (typeLoc === "shipper") return ["items", "arrival", "departure"];
      return ["items", "arrival", "pod", "departure"];
    }
    if (seq === "L") return ["items", "arrival", "pod"];
    return ["items", "arrival", "pod", "departure"];
  };

  // POST event and update reportedMap based on server response Event
  const sendEventReport = async (networkActionCode, stop) => {
    const stopKey = stop.stopid || stop.locid || String(stop.idx);
    const payload = { FoId: FoId ?? selectedShipment.FoId, Action: networkActionCode, StopId: stop.locid || stop.stopid || "" };
    const sendKey = `${stopKey}_${networkActionCode}`;
    try {
      setSending((p) => ({ ...p, [sendKey]: true }));
      const res = await fetch(eventsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        alert(`Failed to report event — server returned ${res.status}: ${txt}`);
        return { ok: false };
      }
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      const serverEvent = body && (body.Event ?? body.event) ? String(body.Event ?? body.event) : null;
      const mapped = mapServerEventToActionKey(serverEvent);

      setReportedMap((prev) => {
        const copy = { ...prev };
        copy[stopKey] = { ...(copy[stopKey] || {}) };
        if (mapped) copy[stopKey][mapped] = true;
        else {
          if (networkActionCode === "ARRV") copy[stopKey].arrival = true;
          else if (networkActionCode === "DEPT") copy[stopKey].departure = true;
          else if (networkActionCode === "POD") copy[stopKey].pod = true;
          else copy[stopKey][networkActionCode.toLowerCase()] = true;
        }
        return copy;
      });

      return { ok: true, body };
    } catch (err) {
      alert(`Failed to report event: ${err.message || err}`);
      return { ok: false, error: err };
    } finally {
      setSending((p) => {
        const c = { ...p };
        delete c[sendKey];
        return c;
      });
    }
  };

  // fetch items
  const fetchItemsForStop = async (stop) => {
    setItemsStop(stop);
    setShowItems(true);
    setItemsLoading(true);
    try {
      const loc = stop.locid || stop.stopid || "";
      if (!loc || !FoId) return;
      const url = `/sap/opu/odata/SAP/ZSKY_SRV/ItemsSet(Location='${encodeURIComponent(loc)}',FoId='${encodeURIComponent(FoId ?? selectedShipment.FoId)}')`;
      const res = await fetch(url);
      if (!res.ok) { setItemsStop((s) => ({ ...s, items: [] })); return; }
      const json = await res.json().catch(() => null);
      const items = Array.isArray(json?.value) ? json.value : Array.isArray(json?.d?.results) ? json.d.results : Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
      setItemsStop((s) => ({ ...s, items }));
      const key = stop.stopid || stop.locid || String(stop.idx);
      setReportedMap((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), items: true } }));
    } catch (e) {
      console.warn("Failed to fetch items", e);
      setItemsStop((s) => ({ ...s, items: [] }));
    } finally {
      setItemsLoading(false);
    }
  };

  const handleMenuOpen = (event, stopKey) => { setAnchorEl(event.currentTarget); setActiveStopKey(stopKey); };
  const handleMenuClose = () => { setAnchorEl(null); setActiveStopKey(null); };

  const handleAction = async (actionKey) => {
    handleMenuClose();
    const stop = derivedStops.find((s) => (s.stopid || s.locid || String(s.idx)) === activeStopKey);
    if (!stop) return;
    const stopIndex = derivedStops.findIndex((s) => (s.stopid || s.locid || String(s.idx)) === activeStopKey);

    if (actionKey === "items") {
      await fetchItemsForStop(stop);
      if (typeof onAction === "function") onAction("items", stop);
      return;
    }

    // cross-stop rule
    const recentlyStartedIndex = Math.max(0, nextPendingIndex - 1);
    const allowedToAct = (stopIndex === nextPendingIndex) || (stopIndex === recentlyStartedIndex);
    if (!allowedToAct) {
      alert("Please report stops in order. Please report the next stop first.");
      return;
    }

    // per-stop sequence enforcement
    const seq = allowedSequenceForStop(stop);
    const key = stop.stopid || stop.locid || String(stop.idx);
    const reported = reportedMap[key] || {};
    const actionIndex = seq.indexOf(actionKey);
    if (actionIndex === -1) {
      alert("Action not available for this stop.");
      return;
    }
    const priorActions = seq.slice(1, actionIndex); // skip 'items'
    const priorAllReported = priorActions.every((pa) => Boolean(reported[pa]));
    if (!priorAllReported) {
      alert("Please follow the event sequence for this stop. Report earlier events first.");
      return;
    }

    if (actionKey === "pod") {
      const r = await sendEventReport("POD", stop);
      if (r.ok && typeof onAction === "function") onAction("pod", { stop, response: r.body });
      return;
    }
    if (actionKey === "arrival" || actionKey === "departure") {
      const code = actionKey === "arrival" ? "ARRV" : "DEPT";
      const r = await sendEventReport(code, stop);
      if (r.ok && typeof onAction === "function") onAction(actionKey, { stop, response: r.body });
      return;
    }

    if (typeof onAction === "function") onAction(actionKey, stop);
  };

  // ---- badge logic: PREFER runtime reportedMap state ----
  const badgeForStop = (stop) => {
    const key = stop.stopid || stop.locid || String(stop.idx);
    const r = reportedMap[key] || {};
    if (r.departure) return "Departure";
    if (r.arrival) return "Arrival";
    if (r.pod) return "POD";

    // fallback to original FinalInfo.event if present
    const ev = (stop.eventRaw ?? "").toString().trim().toUpperCase();
    if (ev) {
      if (ev.includes("DEPART")) return "Departure";
      if (ev.includes("ARRIV")) return "Arrival";
      if (ev.includes("POD")) return "POD";
      return ev;
    }

    // sequence fallback
    if ((stop.stopseqpos || "").toUpperCase() === "F") return "Departure";
    if ((stop.stopseqpos || "").toUpperCase() === "I") return "Arrival";
    const idx = stop.idx;
    if (idx >= derivedStops.length - 2) return "ETA";
    return "Arrival";
  };

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

  // ----------------- render timeline UI (keeps original appearance) -----------------
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>Route timeline</p>
        <p className="text-[11px]" style={{ color: PRIMARY }}>View on map ▸</p>
      </div>

      <div className="mt-2">
        {derivedStops.map((stop, idx) => {
          const key = stop.stopid || stop.locid || String(stop.idx);
          const reported = reportedMap[key] || {};
          const isCompleted = Boolean(reported.arrival || reported.departure);
          const color = isCompleted ? GREEN : BLUE;
          const badge = badgeForStop(stop);

          const seq = allowedSequenceForStop(stop);
          const allowPod = seq.includes("pod");

          // build menu: items always; show all remaining unreported actions
          const menuOptions = [{ key: "items", label: "Items", Icon: Inventory2OutlinedIcon }];
          if (seq.includes("arrival") && !reported.arrival) menuOptions.push({ key: "arrival", label: "Arrival", Icon: EventAvailableIcon });
          if (seq.includes("pod") && !reported.pod && allowPod) menuOptions.push({ key: "pod", label: "Proof of Delivery", Icon: AssignmentTurnedInIcon });
          if (seq.includes("departure") && !reported.departure) menuOptions.push({ key: "departure", label: "Departure", Icon: LocalShippingIcon });

          // cross-stop enabling
          const recentlyStartedIndex = Math.max(0, nextPendingIndex - 1);
          const allowedStopToAct = (idx === nextPendingIndex) || (idx === recentlyStartedIndex);

          const plannedDate = stop.dateTime;
          let actualDate = null;
          let etaDate = null;
          if ((idx <= 1) && !actualDate && plannedDate) actualDate = addMinutes(plannedDate, (idx + 1) * 5);
          if ((idx >= derivedStops.length - 2) && !etaDate && plannedDate) etaDate = addMinutes(plannedDate, (idx + 1) * 10);
          const plannedText = formatDateTime(plannedDate);
          const actualText = formatDateTime(actualDate);
          const etaText = formatDateTime(etaDate);

          return (
            <div key={key} className="flex items-start mb-4 min-w-0">
              <div className="flex flex-col items-center mr-3 w-10 flex-shrink-0">
                <div className="h-9 w-9 rounded-full border-2 flex items-center justify-center" style={{ borderColor: color, backgroundColor: isCompleted ? color : CARD }}>
                  {isCompleted ? (
                    <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#ffffff" }} />
                  ) : (stop.stopseqpos === "F" ? (
                    <LocalShippingIcon sx={{ fontSize: 18, color }} />
                  ) : (
                    <LocationOnIcon sx={{ fontSize: 18, color }} />
                  ))}
                </div>

                {idx !== derivedStops.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: "linear-gradient(to bottom, #e2e8f0, transparent)", marginTop: 8 }} />
                )}
              </div>

              <div className="flex-1 rounded-2xl p-4 border min-w-0" style={{ backgroundColor: CARD, borderColor: "#dde3ec", boxShadow: "4px 4px 14px #d9dde6, -4px -4px 14px #ffffff", position: "relative", overflow: "visible" }}>
                <div style={{ paddingRight: 72, minWidth: 0 }}>
                  <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                    {stop.name1 ? `${stop.name1} (${stop.locid || stop.stopid || "-"})` : `${stop.locid || stop.stopid || "-"}`}
                  </p>

                  {idx <= 1 ? (
                    <>
                      <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>Actual Reported At</p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>{actualText}</p>

                      <p className="text-[12px] mt-2" style={{ color: TEXT_SECONDARY }}>Planned Arrival</p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>{plannedText}</p>
                    </>
                  ) : (idx >= derivedStops.length - 2) ? (
                    <>
                      <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>Planned Arrival</p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>{plannedText}</p>

                      <p className="text-[12px] mt-2" style={{ color: TEXT_SECONDARY }}>Estimated Arrival</p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>{etaText}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>Planned Arrival</p>
                      <p className="text-[12px] mt-0" style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>{plannedText}</p>
                    </>
                  )}

                  <div style={{ marginTop: 8, color: TEXT_SECONDARY, fontSize: 13 }}>
                    {idx <= 1 ? <div>Material Load : {stop.displayLoad ?? stop.materialLoad} Packages</div> : <div>Material Unload : {stop.displayUnload ?? stop.materialUnload} Packages</div>}
                  </div>

                  <Box className="mt-3" sx={{ display: "flex", alignItems: "flex-start", gap: 1, backgroundColor: "#eaf4ff", borderRadius: 1.5, padding: "10px 12px", borderLeft: `4px solid ${color}`, width: "100%", boxSizing: "border-box" }}>
                    <LocationOnIcon sx={{ fontSize: 18, color, marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" sx={{ color: TEXT_SECONDARY, display: "block" }}>Address</Typography>
                      <Typography variant="body2" sx={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 13, whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                        {buildAddress(stop)}
                      </Typography>
                    </div>
                  </Box>
                </div>

                {/* badge + menu */}
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, pointerEvents: "none" }}>
                  <div style={{ pointerEvents: "auto" }}>
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${color}15`, color, display: "inline-block" }}>{badge}</span>
                  </div>
                  <div style={{ pointerEvents: "auto" }}>
                    <IconButton size="small" onClick={(e) => handleMenuOpen(e, key)} sx={{ bgcolor: "#fafafa", borderRadius: 1, padding: 0.5, "&:hover": { bgcolor: "#f0f0f0" } }}>
                      <MoreVertIcon sx={{ fontSize: 18, color: "#6b6c6e" }} />
                    </IconButton>
                  </div>
                </div>
              </div>

              <Menu
                id={`stop-menu-${key}`}
                anchorEl={anchorEl}
                open={menuOpen && activeStopKey === key}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                PaperProps={{
                  sx: {
                    minWidth: 160,
                    p: 0.5,
                    borderRadius: 2,
                    boxShadow: "0 8px 24px rgba(16,24,40,0.12)",
                    "& .MuiMenuItem-root": { py: 0.6, px: 1.5, borderRadius: 1, "&:hover": { bgcolor: "#f5f7fb" } },
                  },
                }}
              >
                <Box sx={{ px: 1.25, py: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip label={badge} size="small" sx={{ backgroundColor: `${color}20`, color, fontWeight: 600, height: 26, borderRadius: 1 }} />
                  <Typography variant="body2" sx={{ color: TEXT_SECONDARY, fontSize: 13 }}>Actions</Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />

                {menuOptions.map((opt) => {
                  const Icon = opt.Icon;
                  const codeForNetwork = opt.key === "arrival" ? "ARRV" : opt.key === "departure" ? "DEPT" : opt.key === "pod" ? "POD" : null;
                  const isSending = Boolean(sending[`${key}_${codeForNetwork ?? opt.key}`]);

                  // NEW enable rule:
                  // - Items always enabled
                  // - Non-items enabled when:
                  //    a) this stop is allowed to act (nextPendingIndex or recentlyStartedIndex)
                  //    AND
                  //    b) all prior non-items actions in the sequence are already reported
                  const reportedForStop = reportedMap[key] || {};
                  const seqForStop = allowedSequenceForStop(stop);
                  const idxOfThisAction = seqForStop.indexOf(opt.key);
                  const priorActions = seqForStop.slice(1, Math.max(1, idxOfThisAction)); // actions before this one, skip 'items'
                  const priorAllReported = priorActions.every((pa) => Boolean(reportedForStop[pa]));
                  const allowedStop = (idx === nextPendingIndex) || (idx === Math.max(0, nextPendingIndex - 1));
                  const enabled = opt.key === "items" ? true : (allowedStop && priorAllReported);

                  return (
                    <MenuItem
                      key={opt.key}
                      onClick={() => {
                        if (!enabled) {
                          alert("Please follow the reporting sequence. This action is not yet available.");
                          return;
                        }
                        handleAction(opt.key);
                      }}
                      disabled={isSending || !enabled}
                    >
                      <ListItemIcon sx={{ minWidth: 34 }}>
                        <Icon fontSize="small" sx={{ color: PRIMARY }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>{opt.label}</Typography>}
                        secondary={isSending ? <Typography variant="caption" sx={{ color: TEXT_SECONDARY }}>Sending…</Typography> : opt.key === "pod" ? <Typography variant="caption" sx={{ color: TEXT_SECONDARY }}>Record POD</Typography> : null}
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
