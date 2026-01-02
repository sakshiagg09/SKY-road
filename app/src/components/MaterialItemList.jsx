// src/components/MaterialItemList.jsx
import React, { useMemo } from "react";
import {
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItemButton,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";

// Color palette aligned with ShipmentDetails / ReportEvent
const BG = "#EFF0F3";
const CARD = "#FFFFFF";
const PRIMARY = "#1976D2";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";

/**
 * Props:
 *  - stop: {
 *      name1?, locid?, stopid?,
 *      FoId?,
 *      items?: array from /odata/v4/GTT/shipmentItems
 *    }
 *  - loading: boolean
 *  - onBack: () => void
 *  - onConfirm: () => void
 */
export default function MaterialItemList({ stop, loading, onBack, onConfirm }) {
  const items = Array.isArray(stop?.items) ? stop.items : [];

  // Title & subtitle
  const stopTitle =
    stop?.name1 ||
    stop?.locid ||
    stop?.stopid ||
    "Material Item List";

  const subtitleParts = [];
  if (stop?.locid) subtitleParts.push(`Location: ${stop.locid}`);
  if (stop?.FoId) subtitleParts.push(`FO: ${stop.FoId}`);
  const subtitle = subtitleParts.join(" • ");

  // Normalize backend item shape -> UI-friendly
  const normalizedItems = useMemo(
    () =>
      items.map((item, idx) => {
        const qtyRaw = (item.Quantity ?? "").toString().trim();
        const qty = qtyRaw === "" ? null : Number(qtyRaw);
        const gwRaw = (item.GrossWeight ?? "").toString().trim();
        const grossWeight = gwRaw === "" ? null : Number(gwRaw);

        return {
          _index: idx,
          id:
            item.PackageId ||
            `${item.FoId || ""}-${item.Location || ""}-${idx}`,
          foId: item.FoId,
          location: item.Location,
          packageId: item.PackageId,
          name: item.ItemDescr || "Material",
          // category: item.ItemCat || "ITEM", // no longer used
          type: item.Type || "",
          qty,
          qtyUom: item.QuantityUom || "",
          grossWeight,
          grossWeightUom: item.GrossWeightUom || "",
        };
      }),
    [items]
  );

  const totalPackages = normalizedItems.length;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        bgcolor: BG,
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
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

        <Box sx={{ textAlign: "center", flex: 1 }}>
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 600,
              color: TEXT_PRIMARY,
            }}
          >
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

        <IconButton size="small" onClick={onConfirm} sx={{ color: PRIMARY }}>
          <CheckIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>

      {/* SUMMARY STRIP – ONLY TOTAL PACKAGES */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 1,
          bgcolor: BG,
        }}
      >
        <Box
          sx={{
            borderRadius: 2,
            p: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            background:
              "linear-gradient(135deg, #ffffff 0%, #f3f6ff 40%, #e0ebff 100%)",
            boxShadow: "6px 6px 14px #d7dae2, -6px -6px 14px #ffffff",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.4 }}>
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
            <Typography
              sx={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: "italic" }}
            >
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
                  {/* First row: ItemDescr + PackageId together */}
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
                      title={
                        item.packageId
                          ? `${item.name} (${item.packageId})`
                          : item.name
                      }
                    >
                      {item.packageId
                        ? `Pkg Id:${item.packageId} (${item.name})`
                        : item.name}
                    </Typography>
                  </Box>

                  {/* Third row: Quantity + Gross Weight together */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      mt: 0.5,
                      flexWrap: "wrap",
                    }}
                  >
                    <Box
                      sx={{
                        px: 1.2,
                        py: 0.5,
                        borderRadius: 999,
                        bgcolor: "#eff6ff",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: TEXT_SECONDARY,
                        }}
                      >
                        Qty:&nbsp;
                        <b style={{ color: TEXT_PRIMARY }}>
                          {item.qty != null ? item.qty : "1"}
                        </b>{" "}
                        {item.qtyUom}
                      </Typography>
                    </Box>

                    {item.grossWeight != null && (
                      <Box
                        sx={{
                          px: 1.2,
                          py: 0.5,
                          borderRadius: 999,
                           bgcolor: "#eff6ff"
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 11,
                            color: TEXT_SECONDARY,
                          }}
                        >
                          GrossWt:&nbsp;
                          <b style={{ color: TEXT_PRIMARY }}>
                            {item.grossWeight}
                          </b>{" "}
                          {item.grossWeightUom}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </ListItemButton>

                {index !== normalizedItems.length - 1 && (
                  <Divider
                    component="li"
                    sx={{
                      mx: 2,
                      mb: 0.2,
                      borderColor: "transparent",
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>

      {/* Optional bottom safe area (for devices with gesture bar) */}
      <Box sx={{ height: 8, bgcolor: CARD }} />
    </Box>
  );
}
