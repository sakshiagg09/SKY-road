// app/src/pages/RouteTimeline.jsx
import React, { useEffect, useMemo, useState } from "react";
import{ LinearProgress } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded"; // Return viewer
import { apiPost, apiGet } from "../auth/api";

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
 * RouteTimeline — robust (NEW trackingDetails payload)
 * ✅ Build stops ONLY from `Stops` array (order + F/I/L)
 * ✅ Pull stop details from `FinalInfo` (mapped by locId occurrence order)
 * ✅ Return shown based on `ReturnInfo` (mapped by StopId, fallback locId)
 * ✅ Events populate per stop from FinalInfo.event + actDateTime
 * ✅ Unloading shown on unloading locations:
 *    - seqPos === "L" OR totalUnloadedPack > 0 OR hasReturnUnload
 * ✅ Strict stop order: only current pending stop can report events (items/return allowed anytime)
 * ✅ Last stop rules:
 *    - If return unload => Arrival + Unloading only
 *    - Else if unloading location => Arrival + Unloading + POD
 *    - Else => Arrival only
 */
export default function RouteTimeline({
  selectedShipment,
  onAction,
  eventsUrl = "/odata/v4/GTT/eventReporting",
  podCompletedInfo,
  delayReportedInfo,
  liveStopEtas = new Map(),
}) {
  const CARD = "#FFFFFF";
  const PRIMARY = "#1976D2";
  const TEXT_PRIMARY = "#071E54";
  const TEXT_SECONDARY = "#6B6C6E";

  const BLUE = "#42A5F5"; // not reached
  const ORANGE = "#ED6C02"; // any event (arrival/unloading/pod etc.)
  const GREEN = "#2E7D32"; // departure / completed last stop
  const RED = "#D32F2F";

  // menu state
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeStopKey, setActiveStopKey] = useState(null);
  const [sending, setSending] = useState({});
  const menuOpen = Boolean(anchorEl);

  // items view (shipment items OR return items)
  const [showItems, setShowItems] = useState(false);
  const [itemsStop, setItemsStop] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  // ======================
  // Date/time helpers
  // ======================

  const parseSapDateTimeToDate = (dt) => {
    if (dt == null || dt === 0) return null;
    const s = String(dt).trim();
    if (!s || s === "0") return null;

    // SAP 14-digit: YYYYMMDDHHmmss -> treat as LOCAL
    if (/^\d{14}$/.test(s)) {
      const yyyy = Number(s.slice(0, 4));
      const mm = Number(s.slice(4, 6));
      const dd = Number(s.slice(6, 8));
      const hh = Number(s.slice(8, 10));
      const min = Number(s.slice(10, 12));
      const ss = Number(s.slice(12, 14));
      const d = new Date(Date.UTC(yyyy, mm - 1, dd, hh, min, ss)); // ✅ local time
      return isNaN(d) ? null : d;
    }

    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  const toS4TimestampUTC = (val) => {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;

  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
};

  const formatDateTimeLocal = (d) => {
    if (!d) return "-";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const buildAddress = (s) => {
    if (!s) return "-";
    const parts = [];
    if (s.street) parts.push(s.street);
    const cityLine = [s.postCode1 ?? s.postCode, s.city1 ?? s.city]
      .filter(Boolean)
      .join(" ");
    if (cityLine) parts.push(cityLine);
    const regionCountry = [s.region, s.country].filter(Boolean).join(", ");
    if (regionCountry) parts.push(regionCountry);
    return parts.join(", ") || "-";
  };

  const safeJsonArray = (value) => {
    if (!value) return [];
    try {
      const arr = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  // ======================
  // Normalize NEW payload
  // selectedShipment can be:
  //  - trackingDetails row itself
  //  - or { raw: trackingDetailsRow, ... }
  // ======================

  const raw = selectedShipment?.raw ?? selectedShipment ?? {};
  const FoId = raw?.FoId ?? selectedShipment?.FoId ?? "";

  const stopsArr = useMemo(() => safeJsonArray(raw?.Stops), [raw?.Stops]);
  const finalInfoArr = useMemo(() => safeJsonArray(raw?.FinalInfo), [raw?.FinalInfo]);
  const returnArr = useMemo(() => safeJsonArray(raw?.ReturnInfo), [raw?.ReturnInfo]);

  if (!FoId || !Array.isArray(stopsArr) || stopsArr.length === 0) {
    return (
      <div style={{ padding: 12 }}>
        <Typography variant="body2" sx={{ color: TEXT_SECONDARY }}>
          No stops available
        </Typography>
      </div>
    );
  }

  // ======================
  // ReturnInfo mapping (view-only quantities)
  // map by StopId first (best), fallback by locId
  // ======================

  const buildReturnQtyMaps = (returnInfo) => {
    const loadByStopId = new Map(); // stopid -> qty
    const unloadByStopId = new Map(); // stopid -> qty
    const loadByLoc = new Map(); // locid -> qty (fallback)
    const unloadByLoc = new Map(); // locid -> qty (fallback)

    returnInfo.forEach((x) => {
      const r = {
        sourceLoc: String(x?.sourceLoc ?? x?.sourceLocId ?? "").trim(),
        destLoc: String(x?.destLoc ?? x?.destLocId ?? "").trim(),
        sourceStopId: String(x?.sourceStopId ?? "").trim(),
        destStopId: String(x?.destStopId ?? "").trim(),
        returnLoaded: Number(x?.returnLoaded ?? 0) || 0,
        returnUnloaded: Number(x?.returnUnloaded ?? 0) || 0,
      };

      if (r.returnLoaded > 0) {
        if (r.sourceStopId) {
          loadByStopId.set(
            r.sourceStopId,
            (loadByStopId.get(r.sourceStopId) || 0) + r.returnLoaded
          );
        }
        if (r.sourceLoc) {
          loadByLoc.set(r.sourceLoc, (loadByLoc.get(r.sourceLoc) || 0) + r.returnLoaded);
        }
      }

      if (r.returnUnloaded > 0) {
        if (r.destStopId) {
          unloadByStopId.set(
            r.destStopId,
            (unloadByStopId.get(r.destStopId) || 0) + r.returnUnloaded
          );
        }
        if (r.destLoc) {
          unloadByLoc.set(r.destLoc, (unloadByLoc.get(r.destLoc) || 0) + r.returnUnloaded);
        }
      }
    });

    return { loadByStopId, unloadByStopId, loadByLoc, unloadByLoc };
  };

  const { loadByStopId, unloadByStopId, loadByLoc, unloadByLoc } = useMemo(
    () => buildReturnQtyMaps(returnArr),
    [returnArr]
  );

  // ======================
  // Build FinalInfo queues by locid (in FinalInfo array order)
  // Then build route stops ONLY from Stops array (order preserved)
  // ======================

  const buildFinalQueuesByLoc = (finalInfo) => {
    // Map key -> [finalInfoRow, ...] (queued in FinalInfo array order)
    // Preferred keys (when FinalInfo.locid exists):
    //  - F/L: `${locid}|${seq}`
    //  - I:   `${locid}|I|PKG` (where item_cat/itemcat === 'PKG')
    // Fallback keys (when FinalInfo.locid is blank):
    //  - F/L: `|${seq}`
    //  - I:   `|I|PKG`
    const m = new Map();

    const push = (key, row) => {
      if (!key) return;
      const list = m.get(key) || [];
      list.push(row);
      m.set(key, list);
    };

    finalInfo.forEach((x) => {
      const locid = String(x?.locid ?? x?.locId ?? "").trim(); // may be ""
      const seq = String(x?.stopseqpos ?? x?.stopSeqPos ?? "").trim().toUpperCase();
      // NOTE: backend may send `itemcat` (as in sample payload) or `item_cat`
      const itemCat = String(x?.item_cat ?? x?.itemCat ?? x?.itemcat ?? "").trim().toUpperCase();

      // Only allow PKG rows to contribute to load/unload
      //if (itemCat && itemCat !== "PKG") return;

      if (!seq) return;

      // F/L: match by locid + stopseqpos (fallback to seq-only if locid missing)
      if (seq === "F" || seq === "L") {
        push(`${locid}|${seq}`, x);
        if (!locid) push(`|${seq}`, x);
        return;
      }

      // I: match by locid + item_cat='PKG' (fallback to PKG-only if locid missing)
      if (seq === "I" && itemCat === "PKG") {
        push(`${locid}|I|PKG`, x);
        if (!locid) push(`|I|PKG`, x);
        return;
      }

      // ignore other FinalInfo rows
    });

    return m;
  };

  const finalQueuesByLoc = useMemo(() => buildFinalQueuesByLoc(finalInfoArr), [finalInfoArr]);

  const getStopKey = (s) => s.stopid || `${s.locid}_${s.stopseqpos}_${s.idx}`;

  const routeStops = useMemo(() => {
    const firstStopLocid = String(stopsArr?.[0]?.locId ?? stopsArr?.[0]?.locid ?? "").trim();
    const firstStopId = String(stopsArr?.[0]?.stopid ?? stopsArr?.[0]?.stopId ?? "").trim();
    // copy queues so we can shift safely
    const localQueues = new Map();
    finalQueuesByLoc.forEach((v, k) => localQueues.set(k, [...v]));

    return stopsArr.map((st, idx) => {
      const locid = String(st?.locId ?? st?.locid ?? "").trim();
      // --- Insert FinalInfo locid extraction ---
      const seq = String(st?.stopSeqPos ?? st?.stopseqpos ?? "").trim().toUpperCase();

      // Match FinalInfo based on requested logic (with fallback for blank FinalInfo.locid):
      //  - F/L stops: locid + stopseqpos (fallback: seq-only)
      //  - I stops:   locid + item_cat='PKG' (fallback: PKG-only)
      const pickKeys =
        seq === "I"
          ? [`${locid}|I|PKG`, `|I|PKG`]
          : (seq === "F" || seq === "L")
            ? [`${locid}|${seq}`, `|${seq}`]
            : [`${locid}|${seq}`, `|${seq}`];

      let info = null;
      for (const k of pickKeys) {
        const q = localQueues.get(k) || [];
        if (q.length) {
          info = q.shift();
          localQueues.set(k, q);
          break;
        }
      }

      const stopid =
        String(st?.stopid ?? st?.stopId ?? "").trim() ||
        String(info?.stopid ?? info?.stopId ?? "").trim() ||
        `${locid}_${seq}_${idx}`;

      const totalLoadedPack = Number(info?.totalLoadedPack ?? info?.TotalLoadedPack ?? 0) || 0;
      const totalUnloadedPack = Number(info?.totalUnloadedPack ?? info?.TotalUnloadedPack ?? 0) || 0;

      // --- Capture FinalInfo locid ---
      const infoLocid = String(info?.locid ?? info?.locId ?? "").trim();

      // --- Updated return load/unload resolution ---
      const returnLoadQty =
        loadByStopId.get(stopid) ??
        (locid && loadByLoc.get(locid)) ??
        (infoLocid && loadByLoc.get(infoLocid)) ??
        0;

      const returnUnloadQty =
        unloadByStopId.get(stopid) ??
        (locid && unloadByLoc.get(locid)) ??
        (infoLocid && unloadByLoc.get(infoLocid)) ??
        0;

      // Planned time (default from matched FinalInfo row for this stop)
      let plannedDateTime = parseSapDateTimeToDate(info?.dateTime ?? info?.dateTimeString ?? null);

      // Special-case: if ReturnInfo indicates a return DESTINATION that maps to the first-stop location,
      // derive the planned arrival for that destination using FinalInfo matched by ReturnInfo.destStopId/destLoc.
      const matchingReturnDest = (returnArr || []).find((rr) => {
        const dStop = String(rr?.destStopId ?? "").trim();
        const dLoc = String(rr?.destLoc ?? rr?.destLocId ?? "").trim();

        // This stop is the return destination (by stopid/locid)
        const isThisDest = (dStop && dStop === stopid) || (dLoc && (dLoc === locid || dLoc === infoLocid));

        // Only apply this planned-time override when the return destination is the SAME location as first stop
        const isFirstLoc = (dLoc && dLoc === firstStopLocid) || (dStop && dStop === firstStopId) || (locid && locid === firstStopLocid);

        return isThisDest && isFirstLoc;
      });

      if (matchingReturnDest) {
        const dStop = String(matchingReturnDest?.destStopId ?? "").trim();
        const dLoc = String(matchingReturnDest?.destLoc ?? matchingReturnDest?.destLocId ?? "").trim();

        // Find the planned datetime in FinalInfo using destStopId first, then destLoc
        const fin = (finalInfoArr || []).find((fi) => {
          const fiStop = String(fi?.stopid ?? fi?.stopId ?? "").trim();
          const fiLoc = String(fi?.locid ?? fi?.locId ?? "").trim();
          return (dStop && fiStop === dStop) || (dLoc && fiLoc === dLoc);
        });

        const retPlanned = parseSapDateTimeToDate(fin?.dateTime ?? fin?.dateTimeString ?? null);
        if (retPlanned) plannedDateTime = retPlanned;
      }

      return {
        idx,
        FoId,
        stopid,
        locid,
        stopseqpos: seq,

        // Planned time
        dateTime: plannedDateTime,

        // Display (address moved to Stops array)
        // Prefer Stops (`st`) and fallback to FinalInfo (`info`) if needed
        name1: st?.name1 ?? info?.name1 ?? info?.name ?? "",
        street: st?.street ?? info?.street ?? "",
        postCode1: st?.postCode1 ?? st?.postCode ?? info?.postCode1 ?? info?.postCode ?? "",
        city1: st?.city1 ?? st?.city ?? info?.city1 ?? info?.city ?? "",
        region: st?.region ?? info?.region ?? "",
        country: st?.country ?? info?.country ?? "",

        latitude: st?.latitude ?? st?.lat ?? info?.latitude ?? info?.Latitude ?? info?.lat ?? null,
        longitude: st?.longitude ?? st?.lng ?? info?.longitude ?? info?.Longitude ?? info?.lng ?? null,

        // Backend milestone + actual time
        eventRaw: (info?.event ?? info?.Event ?? "") || "",
        actDateTime: parseSapDateTimeToDate(info?.actDateTime ?? info?.ActDateTime ?? null),

        totalLoadedPack,
        totalUnloadedPack,
        displayLoad: totalLoadedPack,
        displayUnload: totalUnloadedPack,

        // Return view-only quantities
        returnLoadQty,
        returnUnloadQty,
        hasReturnLoad: Number(returnLoadQty) > 0,
        hasReturnUnload: Number(returnUnloadQty) > 0,
      };
    });
  }, [stopsArr, finalQueuesByLoc, loadByStopId, unloadByStopId, loadByLoc, unloadByLoc, returnArr, finalInfoArr]);

  // IMPORTANT: order is from Stops array ONLY (no date sorting)
  const derivedStops = useMemo(() => routeStops, [routeStops]);

  // ======================
  // Sequence helpers
  // ======================

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

  const extractServerTimestampMs = (body) => {
    const v =
      body?.Timestamp ??
      body?.timestamp ??
      body?.d?.Timestamp ??
      body?.d?.timestamp ??
      null;

    if (!v) return null;

    if (typeof v === "string") {
      const s = v.trim();
      if (/^\d{14}$/.test(s)) return parseSapDateTimeToDate(s)?.getTime() ?? null;
      const d = new Date(s);
      return isNaN(d) ? null : d.getTime();
    }

    if (typeof v === "number") {
      if (v > 10_000_000_000_000) return parseSapDateTimeToDate(String(v))?.getTime() ?? null;
      if (v > 1_000_000_000_000) return v; // ms
      if (v > 1_000_000_000) return v * 1000; // sec
    }

    return null;
  };

  const isLastStop = (stop) => {
    const seqPos = (stop.stopseqpos || "").toUpperCase().trim();
    // Consider the final element in the route as the last stop too (roundtrip return may be seqPos 'I')
    if (typeof stop?.idx === "number" && stop.idx === derivedStops.length - 1) return true;
    if (seqPos === "L") return true;
    return false;
  };

  const isUnloadingLocation = (stop) => {

    return Number(stop.totalUnloadedPack || 0) > 0 || false;
  };

  const allowedSequenceForStop = (stop) => {
    const seqPos = (stop.stopseqpos || "").toUpperCase().trim();

    // Last stop rules:
    if (isLastStop(stop)) {
      // Always include `items` so computeFlagsUpTo works consistently
      if (stop.hasReturnUnload) return ["items", "arrival", "unloading"]; // return drop only
      if (isUnloadingLocation(stop)) return ["items", "arrival", "unloading", "pod"]; // customer unload
      return ["items", "arrival"]; // arrival only
    }

    // First stop (shipping point):
    if (seqPos == "F") return ["items", "departure"];

    // Intermediate:
    if (isUnloadingLocation(stop)) return ["items", "arrival", "unloading", "pod", "departure"];

    // Intermediate:
    if (stop.hasReturnLoad) return ["items", "arrival", "unloading", "pod", "return", "departure"];

    return ["items", "arrival", "departure"];
  };
  // Resolve StopId for POSTing events. For roundtrip last stop (return unload),
  // use destStopId from ReturnInfo mapping so backend receives the correct StopId.
  const resolvePostStopId = (stop) => {
    const baseStopId = String(stop?.stopid ?? stop?.stopId ?? "").trim();

    // Only override on last stop when return-unload exists
    if (isLastStop(stop) && Boolean(stop?.hasReturnUnload)) {
      const resolved = getReturnKeysForStop(stop);
      const retStopId = String(resolved?.stopId ?? "").trim();
      return retStopId || baseStopId;
    }

    return baseStopId;
  };

  // ======================
  // reportedMap (state)
  // { stopKey: { items?:true, arrival?:true, unloading?:true, departure?:true, pod?:true,
  //              arrivalAt?:ms, unloadingAt?:ms, departureAt?:ms, podAt?:ms } }
  // ======================

  const [reportedMap, setReportedMap] = useState({});

  const mapEventStringToActionKey = (ev) => {
    if (!ev) return null;
    const e = String(ev).trim().toUpperCase();
    const isDelay = e.includes("DELAY");
    const isArr = e.includes("ARRIV") || e.includes("ARRV");
    const isUnl = e.includes("UNLOAD") || e.includes("UNLD");
    const isDep = e.includes("DEPART") || e.includes("DEPT");
    const isPod = e.includes("POD");
    const isRet = e.includes("RET");
    if (isDelay) return "delay";
    if (isDep) return "departure";
    if (isPod) return "pod";
    if (isUnl) return "unloading";
    if (isArr) return "arrival";
    if (isRet) return "return";
    return null;
  };

  // Init from backend FinalInfo.event + actDateTime (after derivedStops exist)
  useEffect(() => {
    const m = {};

    derivedStops.forEach((s) => {
      const key = getStopKey(s);
      const mapped = mapEventStringToActionKey(s.eventRaw);
      if (!mapped) return;

      // ✅ delay is a status, not part of sequence
      if (mapped === "delay") {
        const actMs = s.actDateTime?.getTime?.() ?? null;
        m[key] = { ...(m[key] || {}), delay: true, ...(actMs ? { delayAt: actMs } : {}) };
        return;
      }

      const seq = allowedSequenceForStop(s);
      const flags = computeFlagsUpTo(seq, mapped);

      if (!Object.keys(flags).length) return;

      const atKey =
        mapped === "arrival"
          ? "arrivalAt"
          : mapped === "unloading"
            ? "unloadingAt"
            : mapped === "departure"
              ? "departureAt"
              : mapped === "return"
                ? "returnAt"
                : "podAt";

      const actMs = s.actDateTime?.getTime?.() ?? null;

      m[key] = {
        ...(m[key] || {}),
        ...flags,
        ...(actMs ? { [atKey]: actMs } : {}),
      };
    });

    setReportedMap((prev) => ({ ...m, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedStops]);

  const isStopComplete = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};
    const seq = allowedSequenceForStop(stop).filter((x) => x !== "items");
    const last = seq[seq.length - 1];
    return Boolean(r[last]);
  };

  // POD dialog callback updates map
  useEffect(() => {
    if (!podCompletedInfo) return;

    const { event, stopId, ts } = podCompletedInfo;
    if (!stopId) return;

    const mapped = mapEventStringToActionKey(event);
    if (!mapped) return;

    setReportedMap((prev) => {
      const matchingStop = derivedStops.find((s) => String(s.stopid || "") === String(stopId));
      if (!matchingStop) return prev;

      const key = getStopKey(matchingStop);
      const seq = allowedSequenceForStop(matchingStop);
      const flags = computeFlagsUpTo(seq, mapped);

      const atKey =
        mapped === "arrival"
          ? "arrivalAt"
          : mapped === "unloading"
            ? "unloadingAt"
            : mapped === "departure"
              ? "departureAt"
              : mapped === "return"
                ? "returnAt"
                : "podAt";

      return {
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          ...flags,
          [atKey]: Number.isFinite(Number(ts)) ? Number(ts) : prev[key]?.[atKey] ?? Date.now(),
        },
      };
    });
  }, [podCompletedInfo, derivedStops]);

  useEffect(() => {
  if (!delayReportedInfo) return;
  const { stopId, ts } = delayReportedInfo;
  if (!stopId) {
    console.warn("[RouteTimeline] delayReportedInfo missing stopId");
    return;
  }

  const matchingStop = derivedStops.find(
    (s) => String(s.stopid || "") === String(stopId)
  );

  setReportedMap((prev) => {
    if (!matchingStop) return prev;

    const key = getStopKey(matchingStop);
    const delayAt = Number.isFinite(Number(ts)) ? Number(ts) : Date.now();

    const next = {
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        delay: true,
        delayAt,
      },
    };
    return next;
  });
}, [delayReportedInfo, derivedStops]);


  // progress
  const completedCount = useMemo(
    () =>
      derivedStops.reduce((acc, s) => {
        const key = getStopKey(s);
        const r = reportedMap[key] || {};
        return acc + (r.arrival || r.unloading || r.departure || r.pod || r.return ? 1 : 0);
      }, 0),
    [derivedStops, reportedMap]
  );

  const progressPercent = Math.round((completedCount / Math.max(1, derivedStops.length)) * 100);

  useEffect(() => {
    if (typeof onAction === "function") onAction("progress", progressPercent);
  }, [progressPercent, onAction]);

  // next pending stop = first incomplete stop
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

  // POST event (ARRV/DEPT); sends StopId = stop.stopid (or resolved for return last stop)
  const sendEventReport = async (networkActionCode, stop) => {
    console.log("[sendEventReport] ENTER", {
      networkActionCode,
      stopId: stop?.stopid,
      eventsUrl,
    });
    const stopKey = getStopKey(stop);

    const payload = {
      FoId: FoId,
      Action: networkActionCode,
      StopId: resolvePostStopId(stop) || "",
      Latitude: stop.latitude,
      Longitude: stop.longitude,
      Timestamp: toS4TimestampUTC(new Date()),
    };
    console.log("[sendEventReport] payload prepared:", payload);

    const sendKey = `${stopKey}_${networkActionCode}`;

    try {
      console.log("[sendEventReport] setting sending flag:", sendKey);
      setSending((p) => ({ ...p, [sendKey]: true }));

      console.log("[sendEventReport] CALLING apiPost", {
        url: eventsUrl,
        payload,
      });
      // ✅ Works for Android/iOS (full SRV + Bearer) and Web (relative)
      const body = await apiPost(eventsUrl, payload);

      const serverEvent =
        body && (body.Event ?? body.event) ? String(body.Event ?? body.event) : null;
      console.log("[sendEventReport] serverEvent:", serverEvent);
      const mapped =
        mapEventStringToActionKey(serverEvent) ||
        mapEventStringToActionKey(networkActionCode);
      console.log("[sendEventReport] mapped action:", mapped);
      if (!mapped) {
        alert("Backend did not return a valid Event. Cannot move to next step.");
        return { ok: false, body };
      }

      const serverTsMs = extractServerTimestampMs(body) ?? Date.now();
      console.log("[sendEventReport] serverTsMs:", serverTsMs);
      const atKey =
        mapped === "arrival"
          ? "arrivalAt"
          : mapped === "unloading"
            ? "unloadingAt"
            : mapped === "departure"
              ? "departureAt"
              : mapped === "return"
                ? "returnAt"
                : mapped === "pod"
                  ? "podAt"
                  : null;

      setReportedMap((prev) => {
        const seq = allowedSequenceForStop(stop);
        const flags = computeFlagsUpTo(seq, mapped);
        console.log("[sendEventReport] updating reportedMap", {
          stopKey,
          flags,
          atKey,
          serverTsMs,
        });
        return {
          ...prev,
          [stopKey]: {
            ...(prev[stopKey] || {}),
            ...flags,
            ...(atKey ? { [atKey]: serverTsMs } : {}),
          },
        };
      });
      console.log("[sendEventReport] SUCCESS");
      return { ok: true, body, mapped, ts: serverTsMs };
    } catch (err) {
      console.error("[sendEventReport] ERROR", err);
      alert(`Failed to report event: ${err?.message || err}`);
      return { ok: false, error: err };
    } finally {
      console.log("[sendEventReport] clearing sending flag:", sendKey);
      setSending((p) => {
        const c = { ...p };
        delete c[sendKey];
        return c;
      });
    }
  };

  // ✅ Unloading event (ZSKY_SRV)
  const unloadingUrl = "/odata/v4/GTT/UnloadingSet";

  const sendUnloadingReport = async (stop) => {
    const stopKey = getStopKey(stop);
    const sendKey = `${stopKey}_UNLD`;

    try {
      setSending((p) => ({ ...p, [sendKey]: true }));

      const payload = {
          FoId,
          StopId: resolvePostStopId(stop) || "",
          Latitude: stop.latitude ?? null,
          Longitude: stop.longitude ?? null,
          Timestamp: toS4TimestampUTC(new Date()),
        };

      const body = await apiPost(unloadingUrl, payload);

      const serverTsMs = extractServerTimestampMs(body) ?? Date.now();

      setReportedMap((prev) => ({
        ...prev,
        [stopKey]: { ...(prev[stopKey] || {}), unloading: true, unloadingAt: serverTsMs },
      }));

      return { ok: true, body, mapped: "unloading", ts: serverTsMs };
    } catch (err) {
      alert(`Failed to report unloading: ${err?.message || err}`);
      return { ok: false, error: err };
    } finally {
      setSending((p) => {
        const c = { ...p };
        delete c[sendKey];
        return c;
      });
    }
  };

  // Shipment Items (includes StopId)
  const fetchItemsForStop = async (stop) => {
    setItemsStop({ ...stop, FoId, items: [], itemsType: "shipment" });
    setShowItems(true);
    setItemsLoading(true);

    try {
      const loc = stop.locid || stop.stopid || "";
      const stopId = stop.stopid || "";

      if (!loc || !FoId) {
        setItemsStop((s) => ({ ...s, items: [] }));
        return;
      }

      const url =
        `/odata/v4/GTT/shipmentItems` +
        `?$filter=FoId eq '${FoId}'` +
        ` and Location eq '${loc}'` +
        ` and StopId eq '${stopId}'`;

      const json = await apiGet(url);
      const items = Array.isArray(json?.value) ? json.value : [];

      setItemsStop((s) => ({ ...s, items }));

      const key = getStopKey(stop);
      setReportedMap((prev) => ({
        ...prev,
        [key]: { ...(prev[key] || {}), items: true },
      }));
    } catch {
      setItemsStop((s) => ({ ...s, items: [] }));
    } finally {
      setItemsLoading(false);
    }
  };

  // Resolve ReturnItemsSet filter keys from ReturnInfo (source for return pickup, dest for return deliver)
  const getReturnKeysForStop = (stop) => {
    const stopId = String(stop?.stopid ?? stop?.stopId ?? "").trim();
    const locId = String(stop?.locid ?? stop?.locId ?? "").trim();

    // Prefer exact stopId matches (best), then loc matches
    const match =
      (returnArr || []).find((r) => String(r?.sourceStopId ?? "").trim() === stopId) ||
      (returnArr || []).find((r) => String(r?.destStopId ?? "").trim() === stopId) ||
      (returnArr || []).find((r) => String(r?.sourceLoc ?? r?.sourceLocId ?? "").trim() === locId) ||
      (returnArr || []).find((r) => String(r?.destLoc ?? r?.destLocId ?? "").trim() === locId) ||
      null;

    if (!match) return { loc: locId, stopId: stopId };

    // If this stop represents return pickup, use source keys; if return deliver, use dest keys.
    // Fallback to whichever side has values.
    const isPickup =
      (String(match?.sourceStopId ?? "").trim() === stopId) ||
      (String(match?.sourceLoc ?? match?.sourceLocId ?? "").trim() === locId) ||
      Boolean(stop?.hasReturnLoad);

    const resolvedStopId = String(
      (isPickup ? match?.sourceStopId : match?.destStopId) ??
      match?.sourceStopId ??
      match?.destStopId ??
      stopId ??
      ""
    ).trim();

    const resolvedLoc = String(
      (isPickup ? (match?.sourceLoc ?? match?.sourceLocId) : (match?.destLoc ?? match?.destLocId)) ??
      match?.sourceLoc ??
      match?.sourceLocId ??
      match?.destLoc ??
      match?.destLocId ??
      locId ??
      ""
    ).trim();

    return { loc: resolvedLoc, stopId: resolvedStopId };
  };

  // ✅ Return Items (view-only)
  const fetchReturnItemsForStop = async (stop) => {
    setItemsStop({ ...stop, FoId, items: [], itemsType: "return",isReturnPickup: Boolean(stop?.hasReturnLoad), isLastStop: isLastStop(stop), });
    setShowItems(true);
    setItemsLoading(true);

    try {
      const { loc, stopId } = getReturnKeysForStop(stop);

      if (!FoId || !loc || !stopId) {
        setItemsStop((s) => ({ ...s, items: [] }));
        return;
      }

      const url =
        `/odata/v4/GTT/ReturnItemsSet` +
        `?$filter=FoId eq '${FoId}' and Location eq '${loc}' and StopId eq '${stopId}'`;


      const json = await apiGet(url);
      const row = Array.isArray(json?.value) ? json.value[0] : null;
      const loaded = row?.LoadedItems ?? null;

      let items = [];
      try {
        if (typeof loaded === "string") items = JSON.parse(loaded);
        else if (Array.isArray(loaded)) items = loaded;
      } catch {
        items = [];
      }

      setItemsStop((s) => ({ ...s, items }));
    } catch {
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

    // Always-allowed views:
    if (actionKey === "items") {
      await fetchItemsForStop(stop);
      if (typeof onAction === "function") onAction("items", stop);
      return;
    }

    if (actionKey === "return") {
      await fetchReturnItemsForStop(stop);
      if (typeof onAction === "function") onAction("return", { stop });
      return;
    }

    // POD opens dialog (posting happens in PodFlowDialog)
    if (actionKey === "pod") {
      if (typeof onAction === "function") onAction("pod", { stop });
      return;
    }

    // strict stop order gating for events (arrival/unloading/departure)
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

    const priorActions = actionIndex > 1 ? seq.slice(1, actionIndex) : []; // skip "items"
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

    if (actionKey === "unloading") {
      const r = await sendUnloadingReport(stop);
      if (r.ok && typeof onAction === "function") {
        onAction("unloading", { stop, response: r.body, ts: r.ts });
      }
      return;
    }

    if (typeof onAction === "function") onAction(actionKey, stop);
  };

  // Badge ONLY for reported events (NO return badge)
  const badgeForStop = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};

    const last = isLastStop(stop);
     // ✅ show delay prominently (adjust priority if you want)
   

    // ✅ For intermediate stops, departure should be the final state shown
    if (!last && r.departure) return "Departed";

    // ✅ For last stop, keep Delivered highest priority
    if (r.return) return "Returned";
    if (r.pod) return "Delivered";
    if (r.unloading) return "Unloaded";
    if (r.departure) return "Departed";
    if (r.arrival) return "Arrived";
    if (r.delay) return "Delayed";
    return "";
  };

  const colorForStop = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};
    const last = isLastStop(stop);
    if (last && isStopComplete(stop)) return GREEN;
    if (r.departure) return GREEN;
    if (r.arrival || r.unloading || r.pod || r.return) return ORANGE;
    if (r.delay) return RED; 
    return BLUE;
  };

  // Actual reported time per stop:
  // prefer reportedMap timestamps, else fallback to backend actDateTime
  const actualReportedTimeForStop = (stop) => {
    const key = getStopKey(stop);
    const r = reportedMap[key] || {};
    const ms = r.podAt ?? r.unloadingAt ?? r.departureAt ?? r.arrivalAt ?? r.returnAt ?? null;
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
  const isPosting = Object.values(sending).some(Boolean);

  return (
    <div>
      {isPosting && (
      <div className="w-full px-4 pt-2">
        <LinearProgress />
      </div>
    )}
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

          //       const isReturnStop = Boolean(stop.hasReturnLoad || stop.hasReturnUnload);
          const isFirstStop = String(stop.stopseqpos || "").toUpperCase().trim() === "F";
          const returnOnly = !isFirstStop && Boolean(stop.hasReturnUnload) && !stop.hasReturnLoad;

          const menuOptions = returnOnly
            ? [{ key: "return", label: "Return Items", Icon: ReplayRoundedIcon }]
            : [{ key: "items", label: "Items", Icon: Inventory2OutlinedIcon }];
          if (seq.includes("arrival") && !reported.arrival)
            menuOptions.push({ key: "arrival", label: "Arrival", Icon: EventAvailableIcon });

          if (seq.includes("unloading") && !reported.unloading)
            menuOptions.push({
              key: "unloading",
              label: "Unloading",
              Icon: Inventory2OutlinedIcon,
            });

          if (seq.includes("pod") && !reported.pod)
            menuOptions.push({
              key: "pod",
              label: "Proof of Delivery",
              Icon: AssignmentTurnedInIcon,
            });
          // Return viewer action only if return exists
          if (!returnOnly && (stop.hasReturnLoad || stop.hasReturnUnload) && !reported.return)
            menuOptions.push({
              key: "return",
              label: "Return Items",
              Icon: ReplayRoundedIcon,
            });

          if (seq.includes("departure") && !reported.departure)
            menuOptions.push({ key: "departure", label: "Departure", Icon: LocalShippingIcon });

          const plannedText = formatDateTimeLocal(stop.dateTime);

          const actualReportedDate = actualReportedTimeForStop(stop);
          const actualText = actualReportedDate ? formatDateTimeLocal(actualReportedDate) : "-";

          const load = Number(stop.displayLoad || 0);
          const unload = Number(stop.displayUnload || 0);
          const returnLoadQty = Number(stop.returnLoadQty || 0);
          const returnUnloadQty = Number(stop.returnUnloadQty || 0);

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
                    {idx === 0 && (
                        <>
                          <p className="text-[12px] mt-1" style={{ color: TEXT_SECONDARY,fontWeight: 600 }}>
                            Docking Location : DK01
                          </p>
                        </>
                      )}
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

                  {!departed && liveStopEtas.has(stop.stopid) && (
                    <>
                      <p className="text-[12px] mt-2" style={{ color: TEXT_SECONDARY }}>
                        Estimated Arrival
                      </p>
                      <p className="text-[12px] mt-0" style={{ color: "#1976D2", fontWeight: 600 }}>
                        {liveStopEtas.get(stop.stopid).text}
                      </p>
                    </>
                  )}

                  {/* Materials + Return (always show return when present) */}
                  <div style={{ marginTop: 8, color: TEXT_SECONDARY, fontSize: 13, fontWeight: 700 }}>
                    {!returnOnly ? (
                      load > 0 ? (
                        <span style={{ marginRight: 10 }}>Pick up Packages : {load}</span>
                      ) : unload > 0 ? (
                        <span>Deliver Packages : {unload}</span>
                      ) : (
                        <div></div>
                      )
                    ) : null}

                    {(returnLoadQty > 0 || returnUnloadQty > 0) && (
                      <div style={{ marginTop: 4, fontWeight: 700 }}>
                        {returnLoadQty > 0 ? (
                          <span style={{ marginRight: 10 }}>Return Pick up : {returnLoadQty}</span>
                        ) : null}

                        {returnUnloadQty > 0 &&
                          (stop.stopseqpos === "L" || stop.stopseqpos === "I") ? (
                          <span>Return Deliver : {returnUnloadQty}</span>
                        ) : null}
                      </div>
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
                      <Typography variant="caption" sx={{ color: TEXT_SECONDARY, display: "block" }}>
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
                          : opt.key === "unloading"
                            ? "UNLD"
                            : opt.key === "return"
                              ? "RET"
                              : opt.key;

                  const isSending =
                    opt.key === "unloading"
                      ? Boolean(sending[`${key}_UNLD`])
                      : Boolean(sending[`${key}_${codeForNetwork}`]);

                  // sequence enable logic
                  const reportedForStop = reportedMap[key] || {};
                  const seqForStop = allowedSequenceForStop(stop);
                  const idxOfThisAction = seqForStop.indexOf(opt.key);

                  const priorActions = idxOfThisAction > 1 ? seqForStop.slice(1, idxOfThisAction) : [];
                  const priorAllReported = priorActions.every((pa) => Boolean(reportedForStop[pa]));

                  // strict stop gating only for events; items/return always enabled
                  const allowedStop = idx === nextPendingIndex;

                  const returnEnabled = returnOnly ? true : Boolean(reportedForStop.pod);

                  const enabled =
                    opt.key === "items"
                      ? true
                      : opt.key === "return"
                        ? returnEnabled
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
