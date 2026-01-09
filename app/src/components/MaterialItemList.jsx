// src/components/MaterialItemList.jsx
import React, { useMemo, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItemButton,
  Chip,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";
import { apiPost } from "../auth/api";

// Color palette aligned with ShipmentDetails / ReportEvent
const BG = "#EFF0F3";
const CARD = "#FFFFFF";
const PRIMARY = "#1976D2";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";

export default function MaterialItemList({ stop, loading, onBack, onConfirm }) {
  const [posting, setPosting] = useState(false);
  // ---------- helpers ----------
  const safeJsonArray = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s || s === "0") return [];
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const pick = (obj, ...keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== "") return v;
      }
    }
    return undefined;
  };

  const toNum = (v) => {
    if (v === undefined || v === null) return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
  };

  // Title & subtitle
  const stopTitle = stop?.name1 || stop?.locid || stop?.stopid || "Material Item List";
  const subtitleParts = [];
  if (stop?.locid) subtitleParts.push(`Location: ${stop.locid}`);
  if (stop?.FoId) subtitleParts.push(`FO: ${stop.FoId}`);
  const subtitle = subtitleParts.join(" • ");

  /**
   * Your CAP response for shipmentItems is like:
   * stop.items = [
   *   { FoId, Location, StopId, LoadedItems:"[]", UnloadedItems:"[...]", ReturnLoaded:"[...]" ... }
   * ]
   *
   * So we:
   * 1) take the first row
   * 2) choose which list to show (Loaded -> Unloaded -> ReturnLoaded -> ReturnUnloaded)
   * 3) parse JSON string into array
   */
  const { rawItems, listLabel } = useMemo(() => {
    const rows = Array.isArray(stop?.items) ? stop.items : [];
    const row0 = rows[0] || {};

    const loaded = safeJsonArray(row0.LoadedItems ?? row0.loadedItems);
    if (loaded.length) return { rawItems: loaded, listLabel: "Loaded Items" };

    const unloaded = safeJsonArray(row0.UnloadedItems ?? row0.unloadedItems);
    if (unloaded.length) return { rawItems: unloaded, listLabel: "Unloaded Items" };

    const retLoaded = safeJsonArray(row0.ReturnLoaded ?? row0.returnLoaded);
    if (retLoaded.length) return { rawItems: retLoaded, listLabel: "Return Loaded" };

    const retUnloaded = safeJsonArray(row0.ReturnUnloaded ?? row0.returnUnloaded);
    if (retUnloaded.length) return { rawItems: retUnloaded, listLabel: "Return Unloaded" };

    // If RouteTimeline ever passes already-parsed item array directly:
    const direct = Array.isArray(stop?.items) ? stop.items : [];
    // But direct is rows; so only use it if it looks like item objects (has itemDescr/packageid)
    const looksLikeItems =
      Array.isArray(direct) && direct.length && (direct[0]?.itemDescr || direct[0]?.packageid);
    if (looksLikeItems) return { rawItems: direct, listLabel: "Items" };

    return { rawItems: [], listLabel: "Items" };
  }, [stop]);

  // Normalize backend item shape -> UI-friendly
  const normalizedItems = useMemo(() => {
    const list = Array.isArray(rawItems) ? rawItems : [];

    return list.map((it, idx) => {
      const qty = toNum(pick(it, "quantity", "Quantity")) ?? 1;
      const grossWeight = toNum(pick(it, "grossweight", "GrossWeight"));

      const packageId = pick(it, "packageid", "PackageId", "packageId") || "";
      const name = pick(it, "itemDescr", "ItemDescr", "itemdescr") || "Material";

      return {
        _index: idx,
        id:
          packageId ||
          pick(it, "itemId", "ItemId") ||
          `${stop?.FoId || ""}-${stop?.locid || ""}-${idx}`,
        packageId,
        name,
        qty,
        qtyUom: pick(it, "quantityuom", "QuantityUom", "quantityUom") || "",
        grossWeight,
        grossWeightUom: pick(it, "grossweightuom", "GrossWeightUom", "grossWeightUom") || "",
      };
    });
  }, [rawItems, stop?.FoId, stop?.locid]);

  const totalPackages = normalizedItems.length;

  const isReturnView = String(stop?.itemsType ?? "").toLowerCase() === "return";

  const buildReturnItemsSetUrl = () => {
    const fo = String(stop?.FoId ?? "").trim();

    // Prefer the exact Location/StopId from the fetched items row (prevents posting to wrong stop)
    const rows = Array.isArray(stop?.items) ? stop.items : [];
    const row0 = rows[0] || {};

    const loc = String(
      stop?.resolvedLoc ??
      row0.Location ??
      row0.location ??
      ""
    ).trim();

    const sid = String(
      stop?.resolvedStopId ??
      row0.StopId ??
      row0.stopId ??
      ""
    ).trim();

    if (!fo || !loc || !sid) return "";

    // Same URL shape as fetchReturnItemsForStop GET
    return (
      `/odata/v4/GTT/ReturnItemsSet` +
      `?$filter=FoId eq '${fo}' and Location eq '${loc}' and StopId eq '${sid}'`
    );
  };

  const handleConfirmClick = async () => {
    // ✅ Only call API if the items shown are for return
    if (!isReturnView) {
      onConfirm?.();
      return;
    }

    // Use the same resolved keys used for fetching (prefer resolved keys, then row0)
    const rows = Array.isArray(stop?.items) ? stop.items : [];
    const row0 = rows[0] || {};
    const loc = String(stop?.resolvedLoc ?? row0.Location ?? row0.location ?? "").trim();
    const sid = String(stop?.resolvedStopId ?? row0.StopId ?? row0.stopId ?? "").trim();
    const fo = String(stop?.FoId ?? "").trim();

    // POST should not include $filter when payload body is sent
    const url =  `/odata/v4/GTT/ReturnItemsSet`;
   const payload = {
      StopId: sid,
      Location: loc,
      FoId: fo,
    };


    if (!fo || !loc || !sid) {
      alert("Missing FoId/Location/StopId for ReturnItemsSet POST.");
      return;
    }

    try {
      setPosting(true);
      await apiPost(url, payload);
      onConfirm?.({ ok: true });
    } catch (e) {
      alert(e?.message || "Failed to post ReturnItemsSet.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        bgcolor: BG,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: CARD,
          boxShadow: "0 1px 4px rgba(15,23,42,0.10)",
          zIndex: 2,
        }}
      >
        <IconButton size="small" onClick={onBack} sx={{ color: PRIMARY }}>
          <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
        </IconButton>

        <Box sx={{ textAlign: "center", flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>
            {stopTitle}
          </Typography>

          {subtitle && (
            <Typography
              sx={{
                fontSize: 11,
                color: TEXT_SECONDARY,
                mt: 0.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        <IconButton
          size="small"
          onClick={handleConfirmClick}
          disabled={posting}
          sx={{ color: PRIMARY }}
        >
          <CheckIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>

      {/* SUMMARY STRIP */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: BG }}>
        <Box
          sx={{
            borderRadius: 2,
            p: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            background: "linear-gradient(135deg, #ffffff 0%, #f3f6ff 40%, #e0ebff 100%)",
            boxShadow: "6px 6px 14px #d7dae2, -6px -6px 14px #ffffff",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
            <Typography
              sx={{
                fontSize: 11,
                color: TEXT_SECONDARY,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Total Packages : {totalPackages || "—"}
            </Typography>

            <Box>
              <Chip
                size="small"
                label={listLabel}
                sx={{
                  height: 22,
                  fontSize: 11,
                  fontWeight: 600,
                  color: PRIMARY,
                  bgcolor: "#EAF4FF",
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* CONTENT */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          bgcolor: CARD,
          mt: 1,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          pb: 2,
        }}
      >
        {loading && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: "italic" }}>
              Loading items…
            </Typography>
          </Box>
        )}

        {!loading && normalizedItems.length === 0 && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY }}>
              No items found for this stop.
            </Typography>
          </Box>
        )}

        {!loading && normalizedItems.length > 0 && (
          <List disablePadding sx={{ pt: 0.5 }}>
            {normalizedItems.map((item, index) => (
              <React.Fragment key={item.id || item._index}>
                <ListItemButton
                  disableRipple
                  sx={{
                    alignItems: "flex-start",
                    flexDirection: "column",
                    py: 1.6,
                    px: 2.2,
                    mx: 1.4,
                    mb: 1.4,
                    borderRadius: 2,
                    border: "1px solid #dde3ec",
                    boxShadow:
                      "4px 4px 12px rgba(148, 163, 184, 0.4), -3px -3px 10px #ffffff",
                    backgroundColor: "#ffffff",
                    "&:hover": { backgroundColor: "#F7F8FC" },
                  }}
                >
                  {/* Title */}
                  <Box
                    sx={{
                      width: "100%",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: PRIMARY,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.packageId ? `${item.name} (${item.packageId})` : item.name}
                    >
                      {item.packageId ? `Pkg Id:${item.packageId} (${item.name})` : item.name}
                    </Typography>
                  </Box>

                  {/* Chips */}
                  <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                    <Box sx={{ px: 1.2, py: 0.5, borderRadius: 999, bgcolor: "#eff6ff" }}>
                      <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY }}>
                        Qty:&nbsp;
                        <b style={{ color: TEXT_PRIMARY }}>{item.qty != null ? item.qty : "1"}</b>{" "}
                        {item.qtyUom}
                      </Typography>
                    </Box>

                    {item.grossWeight != null && (
                      <Box sx={{ px: 1.2, py: 0.5, borderRadius: 999, bgcolor: "#eff6ff" }}>
                        <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY }}>
                          GrossWt:&nbsp;
                          <b style={{ color: TEXT_PRIMARY }}>{item.grossWeight}</b>{" "}
                          {item.grossWeightUom}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </ListItemButton>

                {index !== normalizedItems.length - 1 && (
                  <Divider component="li" sx={{ mx: 2, mb: 0.2, borderColor: "transparent" }} />
                )}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>

      <Box sx={{ height: 8, bgcolor: CARD }} />
    </Box>
  );
}
