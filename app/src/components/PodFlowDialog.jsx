import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItemButton,
  TextField,
  Chip,
} from "@mui/material";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

// ✅ your existing items component (already used elsewhere)
import MaterialItemList from "../components/MaterialItemList";

// COLORS (aligned with ShipmentDetails / ReportEvent)
const PRIMARY = "#1976D2";
const PRIMARY_DARK = "#0D47A1";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";
const BG = "#EFF0F3";
const CARD = "#FFFFFF";

// Hard-coded items (like SKY 1.0) — replace later with OData result
const INITIAL_ITEMS = [
  {
    // for now id acts as item_id fallback
    id: "0000000020",
    description: "packing material",
    category: "PKG",
    productId: "PACK_TRUCK",
    qty: 1,
    uom: "EA",
    // optional per-item stop override if needed
    stop_id: "0000000050",
  },
  {
    id: "0000000060",
    description: "Lecithin",
    category: "PRD",
    productId: "1000000001",
    qty: 1,
    uom: "EA",
    stop_id: "0000000040",
  },
];

export default function PodFlowDialog({
  open,
  stop,
  foId,
  onClose,
  onSubmit,
  // 🔁 set to your real OData endpoint
  eventsUrl = "/odata/v4/GTT/updatesPOD",
}) {
  // step: question -> items (when discrepancy) -> editItem -> signature
  const [step, setStep] = useState("question"); // 'question' | 'items' | 'editItem' | 'signature'
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [baselineItems, setBaselineItems] = useState(INITIAL_ITEMS); // used to detect qty changes
  const [editingItem, setEditingItem] = useState(null);
  const [signature, setSignature] = useState(""); // placeholder string
  const [attachments, setAttachments] = useState([]); // [{name, size}]
  const [hasDiscrepancy, setHasDiscrepancy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // reset when dialog closes
  React.useEffect(() => {
    if (!open) {
      setStep("question");
      setItems(INITIAL_ITEMS);
      setBaselineItems(INITIAL_ITEMS);
      setEditingItem(null);
      setSignature("");
      setAttachments([]);
      setHasDiscrepancy(false);
      setSubmitting(false);
    }
  }, [open]);

  // If stop is a WRAPPER (has FinalInfo), parse stops from it.
  // If stop is already a STOP object, this will just end up empty.
  const parsedStops = React.useMemo(() => {
    const raw = stop?.FinalInfo;
    if (!raw) return [];

    try {
      // raw may be a JSON string or an array already
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr : [];
    } catch {
      // Some backends double-encode JSON; try a second pass
      try {
        if (typeof raw === "string") {
          const cleaned = raw.trim();
          const unquoted = (cleaned.startsWith('"') && cleaned.endsWith('"'))
            ? cleaned.slice(1, -1).replace(/\\"/g, '"')
            : cleaned;
          const arr2 = JSON.parse(unquoted);
          return Array.isArray(arr2) ? arr2 : [];
        }
      } catch {
        // ignore
      }
      return [];
    }
  }, [stop]);

  // Choose a good stop from FinalInfo for POD/no-discrepancy:
  // Prefer the LAST customer stop (often the POD stop), else last stop overall.
  const stopFromFinalInfo = React.useMemo(() => {
    if (!parsedStops.length) return null;
    const rev = [...parsedStops].reverse();
    const lastCustomer = rev.find(
      (s) => (s?.typeLoc ?? "").toString().toUpperCase().includes("CUST") || (s?.typeLoc ?? "").toString().toUpperCase() === "CUSTOMER"
    );
    return lastCustomer || parsedStops[parsedStops.length - 1];
  }, [parsedStops]);

  // Choose the effective stop:
  // 1) if `stop` already looks like a stop (has stopid/locid/etc) => use it
  // 2) else use derived stop from FinalInfo
  const effectiveStop =
    (stop?.stopid || stop?.locid || stop?.stopId || stop?.locId || stop?.StopId || stop?.LocId)
      ? stop
      : stopFromFinalInfo;

  // FoId can come from prop OR wrapper
  const effectiveFoId = String(foId || stop?.FoId || "");

  // stop title based on effectiveStop
  const stopTitle =
    effectiveStop?.name1 || effectiveStop?.locid || effectiveStop?.stopid || "Selected Stop";

  // IMPORTANT:
  // Your backend example for StopId uses the numeric-looking location id (e.g. "0000000001"),
  // which matches `locid` on your FinalInfo stops. So we prefer locid first.
  const stopIdValue = String(
    effectiveStop?.locid ||
    effectiveStop?.locId ||
    effectiveStop?.LOCID ||
    effectiveStop?.stopid ||
    effectiveStop?.stopId ||
    effectiveStop?.STOPID ||
    effectiveStop?.LocId ||
    effectiveStop?.StopId ||
    ""
  );

  // -----------------------------
  // Payload builders (exact shapes)
  // -----------------------------
  const buildNoDiscrepancyPayload = () => ({
    FoId: effectiveFoId,
    Discrepency: "",
    StopId: stopIdValue,
  });

  const buildDiscrepancyPayload = () => {
    // Prefer sending ONLY changed lines (discrepancy lines)
    const changed = (items || []).filter((it) => {
      const base = (baselineItems || []).find((b) => String(b.id) === String(it.id));
      if (!base) return true;
      return Number(base.qty) !== Number(it.qty);
    });

    if (changed.length === 0) {
      // if they said discrepancy but didn’t change anything, you can either:
      // 1) send all items, or 2) block submit
      // Here we block submit to keep payload meaningful.
      throw new Error("You marked discrepancy but no item quantity was changed.");
    }

    const mapped = changed.map((it) => ({
      item_id: String(it.item_id || it.itemId || it.id || ""),
      stop_id: String(it.stop_id || it.stopId || stopIdValue || ""),
      ActQty: String(Number(it.ActQty ?? it.qty ?? 0)),
      ActQtyUom: String(it.ActQtyUom || it.uom || "EA"),
    }));

    return {
      FoId: effectiveFoId,
      Discrepency: "X",
      Items: JSON.stringify(mapped),
    };
  };

  const postToOData = async (payload) => {
    const res = await fetch(eventsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OData POST failed (${res.status}). ${text}`);
    }
    return true;
  };

  // -----------------------------
  // Navigation / step handlers
  // -----------------------------
  const handleNoDiscrepancy = () => {
    setHasDiscrepancy(false);
    setStep("signature");
  };

  // ✅ discrepancy -> navigate to items component
  const handleYesDiscrepancy = () => {
    setHasDiscrepancy(true);
    setStep("items");
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setStep("editItem");
  };

  const handleEditSave = () => {
    if (!editingItem) return;
    setItems((prev) => prev.map((i) => (String(i.id) === String(editingItem.id) ? editingItem : i)));
    setStep("items"); // go back to items view
  };

  const handleEditChange = (field, value) => {
    setEditingItem((prev) => ({ ...prev, [field]: value }));
  };

  const closeDialog = () => {
    if (typeof onClose === "function") onClose();
  };

  const handleFileAdd = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...files.map((f) => ({ name: f.name, size: f.size }))]);
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ✅ Single submit that posts correct payload based on discrepancy flag
  const handleSubmitPod = async () => {
    try {
      const payload = hasDiscrepancy ? buildDiscrepancyPayload() : buildNoDiscrepancyPayload();

      // optional: notify parent with the exact payload you are sending
      if (typeof onSubmit === "function") onSubmit(payload);

      setSubmitting(true);
      if (!payload.FoId) throw new Error("Missing FoId.");

      await postToOData(payload);
      closeDialog();
    } catch (e) {
      alert(e?.message || "Failed to submit POD.");
    } finally {
      setSubmitting(false);
    }
  };

  // HEADER (common)
  const renderHeader = (subtitle) => (
    <Box
      sx={{
        background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)",
        px: 4,
        py: 3,
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.07,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <Box sx={{ position: "relative", zIndex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <HelpOutlineIcon sx={{ color: "#fff", fontSize: 28 }} />
            <Box>
              <Typography
                sx={{
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: 1,
                }}
              >
                PROOF OF DELIVERY
              </Typography>
              <Typography sx={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <IconButton
            onClick={closeDialog}
            sx={{
              color: "#fff",
              backgroundColor: "rgba(255, 255, 255, 0.18)",
              "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.28)" },
            }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            backgroundColor: "rgba(255, 255, 255, 0.98)",
            borderRadius: "999px",
            boxShadow: "0 8px 18px rgba(15,23,42,0.18)",
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: "999px",
              backgroundColor: "rgba(25,118,210,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LocalShippingIcon sx={{ fontSize: 18, color: PRIMARY }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
              FREIGHT ORDER ID
            </Typography>
            <Typography sx={{ fontSize: 13, color: TEXT_PRIMARY, fontWeight: 700 }}>
              {effectiveFoId || "Not Selected"}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  // STEP 1 – QUESTION
  const renderStepQuestion = () => (
    <>
      {renderHeader("Item Discrepancy Check")}

      <DialogContent sx={{ px: 4, py: 4, bgcolor: BG, flex: 1, overflowY: "auto" }}>
        <Box
          sx={{
            maxWidth: 420,
            mx: "auto",
            backgroundColor: CARD,
            borderRadius: 3,
            boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
            p: 3,
            textAlign: "center",
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              textTransform: "uppercase",
              color: TEXT_SECONDARY,
              letterSpacing: 1.2,
              mb: 1,
            }}
          >
            {stopTitle}
          </Typography>

          <Typography sx={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, mb: 2 }}>
            Any missing / damaged material in this shipment leg?
          </Typography>

          <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, mb: 3 }}>
            Choose <strong>Yes</strong> to adjust quantities, or <strong>No</strong> to continue to POD.
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
            <Button
              onClick={handleNoDiscrepancy}
              sx={{
                flex: 1,
                borderRadius: 2,
                border: "1px solid #CBD2E8",
                textTransform: "none",
                fontWeight: 600,
                color: TEXT_SECONDARY,
                bgcolor: "#F8FAFF",
                "&:hover": { bgcolor: "#EEF3FF" },
              }}
            >
              No
            </Button>
            <Button
              onClick={handleYesDiscrepancy}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 600,
                bgcolor: PRIMARY,
                "&:hover": { bgcolor: PRIMARY_DARK },
              }}
            >
              Yes
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, bgcolor: BG, flexShrink: 0 }}>
        <Button onClick={closeDialog} sx={{ textTransform: "none", color: TEXT_SECONDARY, fontWeight: 500 }}>
          Cancel
        </Button>
      </DialogActions>
    </>
  );

  // STEP 2 – ITEMS (Discrepancy path) ✅ uses MaterialItemList
  const renderStepItems = () => (
    <>
      {renderHeader("Items (Discrepancy)")}

      {/* Uses your existing component; extra props are safe even if it ignores them */}
      <Box sx={{ flex: 1, bgcolor: BG, overflowY: "auto" }}>
        <MaterialItemList
          stop={{ ...(stop || {}), items }}
          loading={false}
          // if your MaterialItemList supports these, great; if not, they’ll be ignored safely
          items={items}
          onItemsChange={setItems}
          onBack={() => {
            setHasDiscrepancy(false);
            setStep("question");
          }}
          onConfirm={() => setStep("signature")}
        />

        {/* If MaterialItemList is view-only, this built-in editor lets you adjust qty */}
        <Box sx={{ px: 3, pb: 3, pt: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 1.2, mb: 1 }}>
            Adjust quantities (for payload)
          </Typography>

          <Box sx={{ bgcolor: CARD, borderRadius: 3, overflow: "hidden", boxShadow: "0 12px 32px rgba(15,23,42,0.12)" }}>
            <List disablePadding>
              {items.map((item, index) => (
                <React.Fragment key={item.id}>
                  <ListItemButton
                    disableRipple
                    onClick={() => handleEditClick(item)}
                    sx={{
                      alignItems: "flex-start",
                      flexDirection: "column",
                      py: 1.5,
                      px: 3,
                      "&:hover": { backgroundColor: "#F7F8FC" },
                    }}
                  >
                    <Box sx={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: PRIMARY,
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {item.description}
                      </Typography>
                      <Typography sx={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY }}>
                        {item.productId}
                      </Typography>
                    </Box>

                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                      {item.category}
                    </Typography>

                    <Box sx={{ mt: 0.5, display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                      <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY }}>
                        Qty:{" "}
                        <strong>
                          {item.qty} {item.uom}
                        </strong>
                      </Typography>

                      <Chip
                        size="small"
                        label="Edit"
                        icon={<EditOutlinedIcon sx={{ fontSize: 14 }} />}
                        sx={{
                          fontSize: 11,
                          bgcolor: "rgba(25,118,210,0.06)",
                          color: PRIMARY,
                          "& .MuiChip-icon": { color: PRIMARY },
                        }}
                      />
                    </Box>
                  </ListItemButton>

                  {index !== items.length - 1 && <Divider sx={{ mx: 3, borderColor: "#E3E6EE" }} />}
                </React.Fragment>
              ))}
            </List>
          </Box>
        </Box>
      </Box>

      <DialogActions sx={{ px: 3, py: 2.5, bgcolor: BG, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
        <Button
          onClick={() => {
            setHasDiscrepancy(false);
            setStep("question");
          }}
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: "none", color: TEXT_SECONDARY, fontWeight: 500 }}
        >
          Back
        </Button>

        <Button
          onClick={() => setStep("signature")}
          variant="contained"
          endIcon={<CheckIcon />}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2,
            bgcolor: PRIMARY,
            "&:hover": { bgcolor: PRIMARY_DARK },
          }}
        >
          Continue to POD
        </Button>
      </DialogActions>
    </>
  );

  // STEP 3 – EDIT ITEM
  const renderStepEditItem = () => (
    <>
      {renderHeader("Edit Item Quantity")}

      <DialogContent sx={{ px: 4, py: 4, bgcolor: BG, flex: 1, overflowY: "auto" }}>
        <Box sx={{ backgroundColor: CARD, borderRadius: 3, p: 3, boxShadow: "0 12px 32px rgba(15,23,42,0.12)" }}>
          <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 1.2, mb: 1 }}>
            Item Description
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY, mb: 2 }}>
            {editingItem?.description}
          </Typography>

          <Box sx={{ display: "grid", gap: 2, mb: 2 }}>
            <TextField label="Product ID" value={editingItem?.productId || ""} disabled size="small" fullWidth />
            <TextField label="Category" value={editingItem?.category || ""} disabled size="small" fullWidth />
            <TextField
              label="Quantity"
              type="number"
              size="small"
              fullWidth
              value={editingItem?.qty ?? ""}
              onChange={(e) => handleEditChange("qty", Number(e.target.value) || 0)}
            />
            <TextField label="UOM" size="small" fullWidth value={editingItem?.uom || ""} disabled />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, bgcolor: BG, flexShrink: 0 }}>
        <Button
          onClick={() => setStep("items")}
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: "none", color: TEXT_SECONDARY, fontWeight: 500 }}
        >
          Back
        </Button>
        <Button
          onClick={handleEditSave}
          variant="contained"
          endIcon={<CheckIcon />}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, bgcolor: PRIMARY, "&:hover": { bgcolor: PRIMARY_DARK } }}
        >
          Save Item
        </Button>
      </DialogActions>
    </>
  );

  // STEP 4 – SIGNATURE & ATTACHMENTS + SUBMIT (posts correct payload)
  const renderStepSignature = () => (
    <>
      {renderHeader("Capture Proof of Delivery")}

      <DialogContent sx={{ px: 4, py: 4, bgcolor: BG, flex: 1, overflowY: "auto" }}>
        <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            label={hasDiscrepancy ? "Discrepancy Reported" : "No Item Discrepancy"}
            sx={{
              bgcolor: hasDiscrepancy ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.12)",
              color: hasDiscrepancy ? "#B45309" : "#047857",
              fontWeight: 600,
            }}
          />
        </Box>

        {/* SIGNATURE CARD */}
        <Box sx={{ backgroundColor: CARD, borderRadius: 3, p: 3, mb: 3, boxShadow: "0 12px 32px rgba(15,23,42,0.12)" }}>
          <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 1.2, mb: 1 }}>
            Signature
          </Typography>

          <Box
            sx={{
              mt: 1,
              mb: 1.5,
              borderRadius: 2,
              border: "1px dashed #CBD2E8",
              height: 140,
              bgcolor: "#F8FAFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: TEXT_SECONDARY,
              fontSize: 13,
            }}
          >
            Tap here to capture signature (placeholder)
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5 }}>
            <Button size="small" onClick={() => setSignature("")} sx={{ textTransform: "none", fontSize: 12, color: TEXT_SECONDARY }}>
              Clear
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => setSignature("signed")}
              sx={{ textTransform: "none", fontSize: 12, bgcolor: PRIMARY, "&:hover": { bgcolor: PRIMARY_DARK } }}
            >
              Save
            </Button>
          </Box>
        </Box>

        {/* ATTACHMENTS CARD */}
        <Box sx={{ backgroundColor: CARD, borderRadius: 3, p: 3, boxShadow: "0 12px 32px rgba(15,23,42,0.12)" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 1.2 }}>
              Attach Files
            </Typography>

            <Button
              component="label"
              startIcon={<UploadFileIcon sx={{ fontSize: 18 }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                bgcolor: "rgba(25,118,210,0.08)",
                color: PRIMARY,
                "&:hover": { bgcolor: "rgba(25,118,210,0.14)" },
              }}
            >
              Add
              <input hidden multiple type="file" onChange={handleFileAdd} />
            </Button>
          </Box>

          {attachments.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY }}>No files attached yet.</Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {attachments.map((file, idx) => (
                <Box
                  key={`${file.name}_${idx}`}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: "#F8FAFF",
                  }}
                >
                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                      {file.name}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </Typography>
                  </Box>

                  <IconButton size="small" onClick={() => handleRemoveAttachment(idx)}>
                    <DeleteOutlineIcon sx={{ fontSize: 18, color: TEXT_SECONDARY }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, bgcolor: BG, flexShrink: 0 }}>
        <Button
          onClick={() => (hasDiscrepancy ? setStep("items") : setStep("question"))}
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: "none", color: TEXT_SECONDARY, fontWeight: 500 }}
          disabled={submitting}
        >
          Back
        </Button>

        <Button
          onClick={handleSubmitPod}
          variant="contained"
          endIcon={<CheckIcon />}
          disabled={submitting}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2,
            bgcolor: PRIMARY,
            "&:hover": { bgcolor: PRIMARY_DARK },
          }}
        >
          {submitting ? "Submitting…" : "Submit POD"}
        </Button>
      </DialogActions>
    </>
  );

  // MAIN DIALOG
  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: "24px",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(15,23,42,0.45)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 32px)",
          m: 2,
        },
      }}
    >
      {step === "question" && renderStepQuestion()}
      {step === "items" && renderStepItems()}         {/* ✅ discrepancy path uses items component */}
      {step === "editItem" && renderStepEditItem()}
      {step === "signature" && renderStepSignature()}
    </Dialog>
  );
}