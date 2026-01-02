// app/src/pages/RouteTimeline.jsx
import React, { useEffect, useMemo, useState } from "react";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded"; // Return placeholder

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
 * RouteTimeline — updated (final):
 * ✅ Backend datetime is UTC -> show in user's phone timezone (with tz name)
 * ✅ Actual Reported time is from eventReporting response Timestamp (SAP UTC 14-digit)
 * ✅ Event payload sends StopId (stop.stopid) (NOT locid)
 * ✅ Badge only for reported events:
 *    ARRIVAL -> Arrived, POD -> Delivered, DEPARTURE -> Departed, else blank
 * ✅ Color coding:
 *    - Any event (arrival / pod / return etc.) => ORANGE
 *    - DEPARTURE only => GREEN
 *    - Not reached => BLUE
 * ✅ Card border color and left accent bar follow event color (orange/green)
 * ✅ totalLoadedPack/totalUnloadedPack drive Material Load/Unload
 * ✅ Return action appears if ReturnInfo exists -> show Return on sourceLoc (not destLoc)
 *
 * ✅ FIXES ADDED NOW:
 * 1) STRICT stop order: cannot report later stop until current stop is COMPLETE (based on last action in its sequence)
 * 2) Persist Actual Reported Time after re-search:
 *    - Use stop.actDateTime from backend to initialize reported timestamps (arrivalAt/departureAt/podAt)
 *    - Also fallback to stop.actDateTime when reportedMap timestamps are missing
 * 3) Return mapping:
 *    - Parse selectedShipment.raw.ReturnInfo and/or selectedShipment.returnLocIds
 *    - Mark stop as Return if stop.locid matches sourceLoc (or sourceLocId) entries
 */
export default function RouteTimeline({
  selectedShipment,
  onAction,
  eventsUrl = "/odata/v4/GTT/eventReporting",
  podCompletedInfo,
}) {
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  const BLUE = "#42A5F5"; // not reached
  const ORANGE = "#ED6C02"; // any event
  const GREEN = "#2E7D32"; // departure only

  // menu state
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeStopKey, setActiveStopKey] = useState(null);
  const [sending, setSending] = useState({});
  const menuOpen = Boolean(anchorEl);

  // items view
  const [showItems, setShowItems] = useState(false);
  const [itemsStop, setItemsStop] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);

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

  const { stops: rawStops = [], FoId, returnLocIds = [], raw = {} } = selectedShipment;

  // ======================
  // Date/time helpers
  // ======================

  // Parse SAP UTC datetime:
  // - if 14 digits: YYYYMMDDHHmmss (UTC)
  // - interpret as UTC (Date.UTC), then display in device timezone
const parseSapUtcDateTimeToDate = (dt) => {
  if (dt === null || typeof dt === "undefined") return null;

  // ✅ handle backend "0" / 0 meaning "not reported"
  if (dt === 0) return null;

  const s = String(dt).trim();
  if (!s || s === "0") return null;

  if (/^\d{14}$/.test(s)) {
    const yyyy = Number(s.slice(0, 4));
    const mm = Number(s.slice(4, 6));
    const dd = Number(s.slice(6, 8));
    const hh = Number(s.slice(8, 10));
    const min = Number(s.slice(10, 12));
    const ss = Number(s.slice(12, 14));

    // ✅ guard against weird zeros like 00000000000000
    if (!yyyy || !mm || !dd) return null;

    const d = new Date(Date.UTC(yyyy, mm - 1, dd, hh, min, ss));
    return isNaN(d) ? null : d;
  }

  const maybe = new Date(s);
  return isNaN(maybe) ? null : maybe;
};


  // Display with device timezone + timezone abbreviation
  const formatDateTimeLocal = (d) => {
  if (!d) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true, // ✅ AM/PM
  });
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

  const getStopKey = (s) => s.stopid || s.locid || String(s.idx);

  // ======================
  // ReturnInfo parsing (sourceLoc based)
  // ======================
  const parseReturnSourceLocs = (returnInfoValue) => {
    if (!returnInfoValue) return [];
    try {
      const arr =
        typeof returnInfoValue === "string" ? JSON.parse(returnInfoValue) : returnInfoValue;
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => x?.sourceLoc || x?.sourceLocId || x?.source || x?.SourceLoc || x?.SOURCELOC)
        .filter(Boolean)
        .map(String);
    } catch (e) {
      console.warn("Failed to parse ReturnInfo in RouteTimeline:", e, returnInfoValue);
      return [];
    }
  };

  // Build return loc set:
  // - keep backward compatibility with returnLocIds (if already passed)
  // - add parsed sourceLocs from raw.ReturnInfo (new payload)
  const returnLocSet = useMemo(() => {
    const base = new Set((returnLocIds || []).map((x) => String(x)));
    const fromRaw = parseReturnSourceLocs(raw?.ReturnInfo);
    fromRaw.forEach((x) => base.add(String(x)));
    return base;
  }, [returnLocIds, raw?.ReturnInfo]);

  // ======================
  // Sequence helpers
  // ======================

  // new mapping:
  // totalLoadedPack > 0 => shipping point
  // totalUnloadedPack > 0 => drop
  const getLocationRole = (stop) => {
    const loaded = Number(stop.totalLoadedPack || 0);
    const unloaded = Number(stop.totalUnloadedPack || 0);
    if (loaded > 0) return "ship";
    if (unloaded > 0) return "drop";
    return "unknown";
  };

  const allowedSequenceForStop = (stop) => {
    const seq = (stop.stopseqpos || "").toUpperCase();
    const role = getLocationRole(stop);

    // helper: last stop = no departure
    const isLastStop = (() => {
      const last = derivedStops[derivedStops.length - 1];
      return last && String(getStopKey(last)) === String(getStopKey(stop));
    })();

    // If stopseqpos empty (new payload), use role + last-stop rule:
    if (!seq) {
      if (role === "ship") return ["items", "departure"]; // load point
      if (role === "drop")
        return isLastStop ? ["items", "arrival", "pod"] : ["items", "arrival", "pod", "departure"];
      return isLastStop ? ["items", "arrival", "pod"] : ["items", "arrival", "pod", "departure"];
    }

    // fallback for older payloads
    if (seq === "F") return ["items", "departure"];
    if (seq === "I") return ["items", "arrival", "pod", "departure"];
    if (seq === "L") return ["items", "arrival", "pod"];
    return ["items", "arrival", "pod", "departure"];
  };

  const computeFlagsUpTo = (seq, lastKey) => {
    const idx = seq.indexOf(lastKey);
    if (idx === -1) return {};
    const flags = {};
    for (let i = 1; i <= idx; i++) {
      const k = seq[i];
      if (k && k !== "items") flags[k] = true;
    }
    return flags;
  };

  // ✅ your response includes: Timestamp: "20251230124316 "
  // interpret as UTC 14 digit -> ms
  const extractServerTimestampMs = (body) => {
    const v = body?.Timestamp ?? body?.timestamp ?? null;
    if (!v) return null;

    if (typeof v === "string") {
      const s = v.trim();
      if (/^\d{14}$/.test(s)) return parseSapUtcDateTimeToDate(s)?.getTime() ?? null;
      const d = new Date(s);
      return isNaN(d) ? null : d.getTime();
    }

    if (typeof v === "number") {
      // if looks like 14-digit
      if (v > 10_000_000_000_000) return parseSapUtcDateTimeToDate(String(v))?.getTime() ?? null;
      // epoch ms
      if (v > 1_000_000_000_000) return v;
      // epoch sec
      if (v > 1_000_000_000) return v * 1000;
    }

    return null;
  };

  // ======================
  // Normalize stops
  // ======================
  const stops = useMemo(
    () =>
      rawStops.map((s, idx) => ({
        idx,
        stopid: s.stopId ?? s.stopid ?? String(idx),
        locid: s.locId ?? s.locid ?? "",
        stopseqpos: (s.stopSeqPos ?? s.stopseqpos ?? "").toString().toUpperCase(),
        dateTime: parseSapUtcDateTimeToDate(s.dateTime ?? s.dateTimeString ?? s.dateTime),
        name1: s.name1 ?? s.name ?? "",
        street: s.street ?? "",
        postCode1: s.postCode1 ?? s.postCode ?? "",
        city1: s.city1 ?? s.city ?? "",
        region: s.region ?? "",
        country: s.country ?? "",
        eventRaw: (s.event ?? s.Event ?? "") || "",
        latitude: s.Latitude ?? s.latitude ?? s.lat ?? null,
        longitude: s.Longitude ?? s.longitude ?? s.lng ?? null,
        // ✅ NEW: persist actual-reported time from backend
        actDateTime: parseSapUtcDateTimeToDate(s.actDateTime ?? s.ActDateTime ?? null),
        totalLoadedPack: Number(s.totalLoadedPack ?? s.TotalLoadedPack ?? 0) || 0,
        totalUnloadedPack: Number(s.totalUnloadedPack ?? s.TotalUnloadedPack ?? 0) || 0,
      })),
    [rawStops]
  );

  const derivedStops = useMemo(() => {
    const sorted = [...stops].sort(
      (a, b) => (a.dateTime?.getTime() ?? 0) - (b.dateTime?.getTime() ?? 0)
    );
    return sorted.map((s) => ({
      ...s,
      displayLoad: s.totalLoadedPack,
      displayUnload: s.totalUnloadedPack,
      // ✅ Return shown on sourceLoc: stop.locid must match sourceLoc set
      isReturnLocation: returnLocSet.has(String(s.locid || "")),
    }));
  }, [stops, returnLocSet]);

  // ======================
  // reportedMap:
  // { stopKey: { items?:true, arrival?:true, departure?:true, pod?:true,
  //              arrivalAt?:ms, departureAt?:ms, podAt?:ms } }
  // ======================
  const [reportedMap, setReportedMap] = useState(() => {
    const m = {};
    derivedStops.forEach((s) => {
      const key = getStopKey(s);
      const ev = (s.eventRaw ?? "").toString().trim().toUpperCase();
      if (!ev) return;

      const seq = allowedSequenceForStop(s);
      let flags = {};
      let lastKey = null;

      if (ev.includes("DEPART")) {
        lastKey = "departure";
        flags = computeFlagsUpTo(seq, "departure");
      } else if (ev.includes("POD")) {
        lastKey = "pod";
        flags = computeFlagsUpTo(seq, "pod");
      } else if (ev.includes("ARRIV")) {
        lastKey = "arrival";
        flags = computeFlagsUpTo(seq, "arrival");
      }

      if (Object.keys(flags).length) {
        const atKey =
          lastKey === "arrival" ? "arrivalAt" : lastKey === "departure" ? "departureAt" : "podAt";
        const actMs = s.actDateTime?.getTime?.() ?? null;

        m[key] = {
          ...(m[key] || {}),
          ...flags,
          ...(actMs ? { [atKey]: actMs } : {}),
        };
      }
    });
    return m;
  });

  // ✅ Helper: stop is COMPLETE only when last required step of its seq is reported
  const isStopComplete = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};
    const seq = allowedSequenceForStop(stop).filter((x) => x !== "items");
    const last = seq[seq.length - 1]; // "departure" or "pod"
    return Boolean(r[last]);
  };

  // POD dialog callback updates map
  useEffect(() => {
    if (!podCompletedInfo) return;

    const { event, stopId, ts } = podCompletedInfo;
    if (!stopId) return;

    const ev = String(event || "").toUpperCase();
    let mapped = null;
    if (ev.includes("ARRIV")) mapped = "arrival";
    else if (ev.includes("DEPART")) mapped = "departure";
    else if (ev.includes("POD")) mapped = "pod";
    if (!mapped) return;

    setReportedMap((prev) => {
      const copy = { ...prev };

      const matchingStop = derivedStops.find(
        (s) => (s.stopid || "").toString() === stopId.toString()
      );
      if (!matchingStop) return prev;

      const key = getStopKey(matchingStop);
      const seq = allowedSequenceForStop(matchingStop);
      const flags = computeFlagsUpTo(seq, mapped);

      const atKey =
        mapped === "arrival" ? "arrivalAt" : mapped === "departure" ? "departureAt" : "podAt";

      copy[key] = {
        ...(copy[key] || {}),
        ...flags,
        [atKey]: Number.isFinite(Number(ts)) ? Number(ts) : copy[key]?.[atKey] ?? Date.now(),
      };
      return copy;
    });
  }, [podCompletedInfo, derivedStops]);

  // progress
  const completedCount = useMemo(
    () =>
      derivedStops.reduce((acc, s) => {
        const key = getStopKey(s);
        const r = reportedMap[key] || {};
        return acc + (r.arrival || r.departure || r.pod ? 1 : 0);
      }, 0),
    [derivedStops, reportedMap]
  );

  const progressPercent = Math.round((completedCount / Math.max(1, derivedStops.length)) * 100);

  useEffect(() => {
    if (typeof onAction === "function") onAction("progress", progressPercent);
  }, [progressPercent, onAction]);

  // ✅ FIX: next pending stop = first INCOMPLETE stop (not "no event")
  const nextPendingIndex = useMemo(() => {
    for (let i = 0; i < derivedStops.length; i++) {
      if (!isStopComplete(derivedStops[i])) return i;
    }
    return derivedStops.length;
  }, [derivedStops, reportedMap]);

  useEffect(() => {
    if (typeof onAction !== "function") return;
    const nextStop = derivedStops[nextPendingIndex] || null;
    onAction("nextStop", { stop: nextStop });
  }, [nextPendingIndex, derivedStops, onAction]);

  // server Event string -> action key
  const mapServerEventToActionKey = (ev) => {
    if (!ev) return null;
    const e = String(ev).toUpperCase();
    if (e.includes("ARRIV")) return "arrival";
    if (e.includes("DEPART")) return "departure";
    if (e.includes("POD")) return "pod";
    if (e.includes("RETURN")) return "return";
    return null;
  };

  // POST event; sends StopId = stop.stopid
  const sendEventReport = async (networkActionCode, stop) => {
    const stopKey = getStopKey(stop);
    const payload = {
      FoId: FoId ?? selectedShipment.FoId,
      Action: networkActionCode,
      StopId: stop.stopid || "",
    };
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
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      const serverEvent =
        body && (body.Event ?? body.event) ? String(body.Event ?? body.event) : null;

      const mapped = mapServerEventToActionKey(serverEvent);
      if (!mapped) {
        alert("Backend did not return a valid Event. Cannot move to next step.");
        return { ok: false, body };
      }

      // timestamp from server
      const serverTsMs = extractServerTimestampMs(body) ?? Date.now();
      const atKey =
        mapped === "arrival"
          ? "arrivalAt"
          : mapped === "departure"
          ? "departureAt"
          : mapped === "pod"
          ? "podAt"
          : null;

      setReportedMap((prev) => {
        const copy = { ...prev };
        const seq = allowedSequenceForStop(stop);
        const flags = computeFlagsUpTo(seq, mapped);

        copy[stopKey] = {
          ...(copy[stopKey] || {}),
          ...flags,
          ...(atKey ? { [atKey]: serverTsMs } : {}),
        };
        return copy;
      });

      return { ok: true, body, mapped, ts: serverTsMs };
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

  // items call unchanged
  const fetchItemsForStop = async (stop) => {
    setItemsStop(stop);
    setShowItems(true);
    setItemsLoading(true);

    try {
      const loc = stop.locid || stop.stopid || "";
      const foId = selectedShipment.FoId;

      if (!loc || !foId) {
        console.warn("Missing loc or FoId for items call", { loc, foId });
        setItemsStop((s) => ({ ...s, items: [] }));
        return;
      }

      const url =
        `/odata/v4/GTT/shipmentItems` +
        `?$filter=FoId eq '${foId}'` +
        ` and Location eq '${loc}'`;

      const res = await fetch(url);
      if (!res.ok) {
        console.error("shipmentItems call failed", res.status, res.statusText);
        setItemsStop((s) => ({ ...s, items: [] }));
        return;
      }

      const json = await res.json().catch(() => null);
      const items = Array.isArray(json?.value) ? json.value : [];

      setItemsStop((s) => ({ ...s, items }));

      const key = getStopKey(stop);
      setReportedMap((prev) => ({
        ...prev,
        [key]: { ...(prev[key] || {}), items: true },
      }));
    } catch (e) {
      console.warn("Failed to fetch items", e);
      setItemsStop((s) => ({ ...s, items: [] }));
    } finally {
      setItemsLoading(false);
    }
  };

  const handleMenuOpen = (event, stopKey) => {
    setAnchorEl(event.currentTarget);
    setActiveStopKey(stopKey);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveStopKey(null);
  };

  const handleAction = async (actionKey) => {
    handleMenuClose();

    const stop = derivedStops.find((s) => getStopKey(s) === activeStopKey);
    if (!stop) return;

    const stopIndex = derivedStops.findIndex((s) => getStopKey(s) === activeStopKey);

    if (actionKey === "items") {
      await fetchItemsForStop(stop);
      if (typeof onAction === "function") onAction("items", stop);
      return;
    }

    // POD opens dialog (posting happens in PodFlowDialog)
    if (actionKey === "pod") {
      if (typeof onAction === "function") onAction("pod", { stop });
      return;
    }

    // Return placeholder
    if (actionKey === "return") {
      alert("Return functionality will be added later. UI is ready.");
      return;
    }

    // ✅ FIX: strict stop order enforcement (ONLY current pending stop can be reported)
    const allowedToAct = stopIndex === nextPendingIndex;
    if (!allowedToAct) {
      alert("Please report stops in order. Complete the current stop first.");
      return;
    }

    // per-stop sequence enforcement
    const seq = allowedSequenceForStop(stop);
    const key = getStopKey(stop);
    const reported = reportedMap[key] || {};
    const actionIndex = seq.indexOf(actionKey);
    if (actionIndex === -1) {
      alert("Action not available for this stop.");
      return;
    }

    const priorActions = seq.slice(1, actionIndex);
    const priorAllReported = priorActions.every((pa) => Boolean(reported[pa]));
    if (!priorAllReported) {
      alert("Please follow the event sequence for this stop. Report earlier events first.");
      return;
    }

    if (actionKey === "arrival" || actionKey === "departure") {
      const code = actionKey === "arrival" ? "ARRV" : "DEPT";
      const r = await sendEventReport(code, stop);
      if (r.ok && typeof onAction === "function") {
        onAction(actionKey, { stop, response: r.body, ts: r.ts });
      }
      return;
    }

    if (typeof onAction === "function") onAction(actionKey, stop);
  };

  // Badge ONLY for reported events
  const badgeForStop = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};
    if (r.pod) return "Delivered";
    if (r.departure) return "Departed";
    if (r.arrival) return "Arrived";
    return "";
  };

  // Color coding:
  // - Departure only => GREEN
  // - Any other event => ORANGE
  // - Not reached => BLUE

  const isLastStop = (stop) => {
  const last = derivedStops[derivedStops.length - 1];
  if (!last) return false;
  return String(getStopKey(last)) === String(getStopKey(stop));
};

 const colorForStop = (stop) => {
  const key = getStopKey(stop);
  const r = reportedMap[key] || {};

  const last = isLastStop(stop);

  if (last && (r.pod || (r.arrival && r.pod))) return GREEN;

  // existing rules
  if (r.departure) return GREEN;              
  if (r.arrival || r.pod) return ORANGE;      
  return BLUE;                               
};

  // Actual reported time per stop:
  // prefer reportedMap timestamps, else fallback to backend actDateTime (persist across re-search)
  const actualReportedTimeForStop = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};
    const ms = r.departureAt ?? r.podAt ?? r.arrivalAt ?? null;
    if (ms) return new Date(ms);
    return stop.actDateTime || null;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
          Route timeline
        </p>
      </div>

      <div className="mt-2">
        {derivedStops.map((stop, idx) => {
          const key = getStopKey(stop);
          const reported = reportedMap[key] || {};

          const badge = badgeForStop(stop);
          const color = colorForStop(stop);

          // check icon only for departure (green)
          const departed = Boolean(reported.departure);

          const seq = allowedSequenceForStop(stop);

          const menuOptions = [{ key: "items", label: "Items", Icon: Inventory2OutlinedIcon }];

          if (seq.includes("arrival") && !reported.arrival)
            menuOptions.push({ key: "arrival", label: "Arrival", Icon: EventAvailableIcon });

          if (seq.includes("pod") && !reported.pod)
            menuOptions.push({
              key: "pod",
              label: "Proof of Delivery",
              Icon: AssignmentTurnedInIcon,
            });

          if (seq.includes("departure") && !reported.departure)
            menuOptions.push({ key: "departure", label: "Departure", Icon: LocalShippingIcon });

          if (stop.isReturnLocation)
            menuOptions.push({
              key: "return",
              label: "Return",
              Icon: ReplayRoundedIcon,
            });

          // planned datetime (UTC from backend -> local display)
          const plannedText = formatDateTimeLocal(stop.dateTime);

          // actual reported time
          const actualReportedDate = actualReportedTimeForStop(stop);
         const actualText = actualReportedDate ? formatDateTimeLocal(actualReportedDate) : "-";

          // load/unload
          const load = Number(stop.displayLoad || 0);
          const unload = Number(stop.displayUnload || 0);

          return (
            <div key={key} className="flex items-start mb-4 min-w-0">
              {/* Left icon column */}
              <div className="flex flex-col items-center mr-3 w-10 flex-shrink-0">
                <div
                  className="h-9 w-9 rounded-full border-2 flex items-center justify-center"
                  style={{
                    borderColor: color,
                    backgroundColor: departed ? color : CARD,
                  }}
                >
                  {departed ? (
                    <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#ffffff" }} />
                  ) : (
                    <LocationOnIcon sx={{ fontSize: 18, color }} />
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

              {/* Stop card */}
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
                {/* Left accent bar */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 12,
                    bottom: 12,
                    width: 4,
                    borderRadius: 4,
                    backgroundColor: badge ? color : "transparent",
                    opacity: badge ? 0.95 : 0,
                  }}
                />

                <div style={{ paddingRight: 72, minWidth: 0 }}>
                  <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                    {stop.name1
                      ? `${stop.name1} (${stop.locid || stop.stopid || "-"})`
                      : `${stop.locid || stop.stopid || "-"}`}
                  </p>

                  <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY }}>
                    Actual Reported At
                  </p>
                  <p
                    className="text-[12px] mt-0"
                    style={{ color: TEXT_SECONDARY, fontWeight: 600 }}
                  >
                    {actualText}
                  </p>

                  <p className="text-[12px] mt-2" style={{ color: TEXT_SECONDARY }}>
                    Planned Arrival
                  </p>
                  <p
                    className="text-[12px] mt-0"
                    style={{ color: TEXT_SECONDARY, fontWeight: 600 }}
                  >
                    {plannedText}
                  </p>

                  <div style={{ marginTop: 8, color: TEXT_SECONDARY, fontSize: 13 }}>
                    {load > 0 ? (
                      <div>Material Load : {load} Packages</div>
                    ) : unload > 0 ? (
                      <div>Material Unload : {unload} Packages</div>
                    ) : (
                      <div>Material : —</div>
                    )}
                  </div>

                  <Box
                    className="mt-3"
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      backgroundColor: "#eaf4ff",
                      borderRadius: 1.5,
                      padding: "10px 12px",
                      borderLeft: `4px solid ${badge ? color : BLUE}`,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <LocationOnIcon
                      sx={{
                        fontSize: 18,
                        color: badge ? color : BLUE,
                        marginTop: "2px",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: TEXT_SECONDARY, display: "block" }}
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

                {/* Badge + menu */}
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
                  <div
                    style={{
                      pointerEvents: "auto",
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {badge ? (
                      <span
                        className="px-2 py-1 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${color}15`,
                          color,
                          display: "inline-block",
                        }}
                      >
                        {badge}
                      </span>
                    ) : null}

                    {stop.isReturnLocation ? (
                      <span
                        className="px-2 py-1 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.05)",
                          color: TEXT_PRIMARY,
                          display: "inline-block",
                        }}
                      >
                        Return
                      </span>
                    ) : null}
                  </div>

                  <div style={{ pointerEvents: "auto" }}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, key)}
                      sx={{
                        bgcolor: "#fafafa",
                        borderRadius: 1,
                        padding: 0.5,
                        "&:hover": { bgcolor: "#f0f0f0" },
                      }}
                    >
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
                    minWidth: 180,
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
                  <Chip
                    label={badge || "—"}
                    size="small"
                    sx={{
                      backgroundColor: `${color}20`,
                      color,
                      fontWeight: 600,
                      height: 26,
                      borderRadius: 1,
                    }}
                  />
                  <Typography variant="body2" sx={{ color: TEXT_SECONDARY, fontSize: 13 }}>
                    Actions
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />

                {menuOptions.map((opt) => {
                  const Icon = opt.Icon;

                  const codeForNetwork =
                    opt.key === "arrival"
                      ? "ARRV"
                      : opt.key === "departure"
                      ? "DEPT"
                      : opt.key === "pod"
                      ? "POD"
                      : opt.key === "return"
                      ? "RETURN"
                      : null;

                  const isSending = Boolean(sending[`${key}_${codeForNetwork ?? opt.key}`]);

                  // sequence enable logic
                  const reportedForStop = reportedMap[key] || {};
                  const seqForStop = allowedSequenceForStop(stop);
                  const idxOfThisAction = seqForStop.indexOf(opt.key);

                  const priorActions = seqForStop.slice(1, Math.max(1, idxOfThisAction));
                  const priorAllReported = priorActions.every((pa) => Boolean(reportedForStop[pa]));

                  // ✅ STRICT stop gating: only current pending stop can execute events
                  const allowedStop = idx === nextPendingIndex;

                  const enabled =
                    opt.key === "items"
                      ? true
                      : opt.key === "return"
                      ? true
                      : allowedStop && priorAllReported;

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
                        primary={
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {opt.label}
                          </Typography>
                        }
                        secondary={
                          isSending ? (
                            <Typography variant="caption" sx={{ color: TEXT_SECONDARY }}>
                              Sending…
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
