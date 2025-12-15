// src/dialogs/PodFlowDialog.jsx
import React, { useState, useEffect, useMemo } from "react";
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

import MaterialItemList from "../components/MaterialItemList";
import SignatureAttachmentsSection from "./SignatureAttachmentsSection";

// COLORS
const PRIMARY = "#1976D2";
const PRIMARY_DARK = "#0D47A1";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";
const BG = "#EFF0F3";
const CARD = "#FFFFFF";

export default function PodFlowDialog({
  open,
  stop,
  foId,
  onClose,
  onSubmit,
  // POD OData endpoint
  eventsUrl = "/odata/v4/GTT/updatesPOD",
  // items OData endpoint
  itemsUrl = "/odata/v4/GTT/shipmentItems",
  // attachments proxy endpoint (CAP -> /AttachmentsSet in S/4)
  attachmentsUrl = "/odata/v4/GTT/attachmentUpload",
}) {
  // step: question -> items (when discrepancy) -> editItem -> signature
  const [step, setStep] = useState("question"); // 'question' | 'items' | 'editItem' | 'signature'
  const [items, setItems] = useState([]);
  const [baselineItems, setBaselineItems] = useState([]); // used to detect qty changes
  const [editingItem, setEditingItem] = useState(null);

  // signature is a dataURL (data:image/jpeg;base64,...)
  const [signature, setSignature] = useState("");

  // real File[] for attachments
  const [attachments, setAttachments] = useState([]);

  const [hasDiscrepancy, setHasDiscrepancy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

  // ----------------- stop / FoId helpers -----------------
  const parsedStops = useMemo(() => {
    const raw = stop?.FinalInfo;
    if (!raw) return [];
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr : [];
    } catch {
      try {
        if (typeof raw === "string") {
          const cleaned = raw.trim();
          const unquoted =
            cleaned.startsWith('"') && cleaned.endsWith('"')
              ? cleaned.slice(1, -1).replace(/\\"/g, '"')
              : cleaned;
          const arr2 = JSON.parse(unquoted);
          return Array.isArray(arr2) ? arr2 : [];
        }
      } catch {
        return [];
      }
      return [];
    }
  }, [stop]);

  const stopFromFinalInfo = useMemo(() => {
    if (!parsedStops.length) return null;
    const rev = [...parsedStops].reverse();
    const lastCustomer = rev.find(
      (s) =>
        (s?.typeLoc ?? "").toString().toUpperCase().includes("CUST") ||
        (s?.typeLoc ?? "").toString().toUpperCase() === "CUSTOMER"
    );
    return lastCustomer || parsedStops[parsedStops.length - 1];
  }, [parsedStops]);

  const effectiveStop =
    stop?.stopid ||
    stop?.locid ||
    stop?.stopId ||
    stop?.locId ||
    stop?.StopId ||
    stop?.LocId
      ? stop
      : stopFromFinalInfo;

  const effectiveFoId = String(foId || stop?.FoId || "");

  const stopTitle =
    effectiveStop?.name1 ||
    effectiveStop?.locid ||
    effectiveStop?.stopid ||
    "Selected Stop";

  // Prefer Location (like "1000000000") as StopId for POD API
  const stopIdValue = String(
    stop?.Location ||
      effectiveStop?.Location ||
      effectiveStop?.locid ||
      effectiveStop?.locId ||
      effectiveStop?.LOCID ||
      effectiveStop?.location ||
      effectiveStop?.stopid ||
      effectiveStop?.stopId ||
      effectiveStop?.STOPID ||
      effectiveStop?.LocId ||
      effectiveStop?.StopId ||
      ""
  );

  // ----------------- normalise shipmentItems -----------------
  const normaliseItem = (raw, index) => {
    const baseQty = Number(raw.Quantity ?? raw.Qty ?? 0);
    return {
      id: raw.PackageId || `${index}`,
      FoId: raw.FoId,
      Location: raw.Location,
      PackageId: raw.PackageId,
      ItemDescr: raw.ItemDescr,
      ItemCat: raw.ItemCat,
      Type: raw.Type,
      Quantity: baseQty,
      QuantityUom: raw.QuantityUom || "EA",
      GrossWeight: raw.GrossWeight,
      GrossWeightUom: raw.GrossWeightUom,
      StopId: raw.StopId || "",
      // UI fields
      description: raw.ItemDescr || "",
      category: raw.ItemCat || "",
      productId: raw.PackageId || "",
      qty: baseQty,
      uom: raw.QuantityUom || "EA",
    };
  };

  // ----------------- load real items -----------------
  useEffect(() => {
    const resetState = () => {
      setStep("question");
      setItems([]);
      setBaselineItems([]);
      setEditingItem(null);
      setSignature("");
      setAttachments([]);
      setHasDiscrepancy(false);
      setSubmitting(false);
      setItemsLoading(false);
    };

    if (!open) {
      resetState();
      return;
    }

    const loadItems = async () => {
      try {
        setItemsLoading(true);

        // If items already on stop (from timeline), reuse
        if (Array.isArray(stop?.items) && stop.items.length > 0) {
          const norm = stop.items.map((it, idx) => normaliseItem(it, idx));
          setItems(norm);
          setBaselineItems(norm);
          return;
        }

        // Otherwise, load from backend
        if (!effectiveFoId || !stopIdValue) {
          setItems([]);
          setBaselineItems([]);
          return;
        }

        const url =
          `${itemsUrl}` +
          `?$filter=FoId eq '${effectiveFoId}'` +
          ` and Location eq '${stopIdValue}'`;

        const res = await fetch(url);
        if (!res.ok) {
          console.error(
            "shipmentItems OData failed",
            res.status,
            res.statusText
          );
          setItems([]);
          setBaselineItems([]);
          return;
        }

        const json = await res.json().catch(() => null);
        const arr = Array.isArray(json?.value) ? json.value : [];
        const norm = arr.map((it, idx) => normaliseItem(it, idx));

        setItems(norm);
        setBaselineItems(norm);
      } catch (e) {
        console.warn("Failed to load shipmentItems", e);
        setItems([]);
        setBaselineItems([]);
      } finally {
        setItemsLoading(false);
      }
    };

    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveFoId, stopIdValue]);

  // ----------------------------- Payload builders -----------------------------
  const buildNoDiscrepancyPayload = () => ({
    FoId: effectiveFoId,
    Discrepency: "",
    StopId: stopIdValue,
  });

  const buildDiscrepancyPayload = () => {
    const changed = (items || []).filter((it) => {
      const base = (baselineItems || []).find(
        (b) =>
          String(b.PackageId) === String(it.PackageId) &&
          String(b.Location) === String(it.Location)
      );
      if (!base) return true;
      return Number(base.Quantity) !== Number(it.qty);
    });

    if (changed.length === 0) {
      throw new Error(
        "You marked discrepancy but no item quantity was changed."
      );
    }

    const mapped = changed.map((it) => ({
      item_id: String(it.PackageId), // correct mapping
      stop_id: String(it.StopId), // correct mapping
      ActQty: String(Number(it.qty)),
      ActQtyUom: String(it.QuantityUom || it.uom || "EA"),
    }));

    return {
      FoId: effectiveFoId,
      Discrepency: "X",
      Items: JSON.stringify(mapped), // backend expects JSON string
      StopId: stopIdValue,
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

    // 👉 This will be your object:
    // {
    //   "@odata.context": "...",
    //   "Event": "POD",
    //   "StopId": "...",
    //   "FoId": "..."
    //   ...
    // }
    const json = await res.json().catch(() => null);
    return json;
  };

  // ----------------------------- Attachments + Signature upload -----------------------------

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          resolve("");
          return;
        }
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadSingleAttachment = async (file) => {
    if (!attachmentsUrl || !effectiveFoId) return;

    const base64 = await readFileAsBase64(file);
    if (!base64) return;

    const ext = (file.name.split(".").pop() || "").toUpperCase();
    const fileType = ext || "BIN";

    const payload = {
      FoId: effectiveFoId,
      FileType: fileType, // e.g. JPG, PNG, PDF, ...
      PDFBase64: base64,
    };

    const res = await fetch(attachmentsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Attachment upload failed for ${file.name} (${res.status}). ${text}`
      );
    }
  };

  // Signature as JPG
  const uploadSignatureAttachment = async () => {
    if (!attachmentsUrl || !effectiveFoId || !signature) return;

    // signature is like "data:image/jpeg;base64,AAAA..."
    const base64 = signature.split(",")[1] || "";
    if (!base64) return;

    const payload = {
      FoId: effectiveFoId,
      FileType: "JPG", // signature stored as JPG in backend
      PDFBase64: base64,
    };

    const res = await fetch(attachmentsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Signature upload failed (${res.status}). ${text}`);
    }
  };

  const uploadAllAttachmentsAndSignature = async () => {
    // sequential, simple – change to Promise.all if backend can handle parallel
    for (const file of attachments || []) {
      await uploadSingleAttachment(file);
    }
    await uploadSignatureAttachment();
  };

  // ----------------------------- Navigation / handlers -----------------------------

  const handleNoDiscrepancy = () => {
    setHasDiscrepancy(false);
    setStep("signature");
  };

  const handleYesDiscrepancy = () => {
    if (!items.length) {
      alert("No items were loaded for this stop. Cannot record discrepancy.");
      return;
    }
    setHasDiscrepancy(true);
    setStep("items");
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setStep("editItem");
  };

  const handleEditSave = () => {
    if (!editingItem) return;
    setItems((prev) =>
      prev.map((i) =>
        String(i.PackageId) === String(editingItem.PackageId) &&
        String(i.Location) === String(editingItem.Location)
          ? editingItem
          : i
      )
    );
    setStep("items");
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
    setAttachments((prev) => [...prev, ...files]);
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitPod = async () => {
    try {
      const payload = hasDiscrepancy
        ? buildDiscrepancyPayload()
        : buildNoDiscrepancyPayload();

      setSubmitting(true);
      if (!payload.FoId) throw new Error("Missing FoId.");

      // 1) Submit POD and get backend result (with Event/FoId/StopId)
      const podResult = await postToOData(payload);

      // 2) Submit attachments + signature (if any)
      if ((attachments && attachments.length > 0) || signature) {
        await uploadAllAttachmentsAndSignature();
      }

      // 3) Notify parent that POD is successfully done
      //    -> parent can update timeline based on podResult.Event
      if (typeof onSubmit === "function") {
        onSubmit({
          payload,
          response: podResult,
        });
      }

      // 4) Close dialog
      closeDialog();
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to submit POD / attachments.");
    } finally {
      setSubmitting(false);
    }
  };

  // -------------- UI helpers --------------
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
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
            <Typography
              sx={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}
            >
              FREIGHT ORDER ID
            </Typography>
            <Typography
              sx={{ fontSize: 13, color: TEXT_PRIMARY, fontWeight: 700 }}
            >
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

      <DialogContent
        sx={{
          px: 4,
          py: 4,
          bgcolor: BG,
          flex: 1,
          overflowY: "auto",
        }}
      >
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

          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              mb: 2,
            }}
          >
            Any missing / damaged material in this shipment leg?
          </Typography>

          <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, mb: 3 }}>
            Choose <strong>Yes</strong> to adjust quantities, or{" "}
            <strong>No</strong> to continue to POD.
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
              disabled={itemsLoading}
            >
              {itemsLoading ? "Loading…" : "Yes"}
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, bgcolor: BG, flexShrink: 0 }}>
        <Button
          onClick={closeDialog}
          sx={{
            textTransform: "none",
            color: TEXT_SECONDARY,
            fontWeight: 500,
          }}
        >
          Cancel
        </Button>
      </DialogActions>
    </>
  );

  // STEP 2 – ITEMS
  const renderStepItems = () => (
    <>
      {renderHeader("Items (Discrepancy)")}

      <Box sx={{ flex: 1, bgcolor: BG, overflowY: "auto" }}>
        <MaterialItemList
          stop={{ ...(stop || {}), items }}
          loading={itemsLoading}
          items={items}
          onItemsChange={setItems}
          onBack={() => {
            setHasDiscrepancy(false);
            setStep("question");
          }}
          onConfirm={() => setStep("signature")}
        />

        <Box sx={{ px: 3, pb: 3, pt: 1.5 }}>
          <Typography
            sx={{
              fontSize: 12,
              color: TEXT_SECONDARY,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              mb: 1,
            }}
          >
            Adjust quantities (for payload)
          </Typography>

          <Box
            sx={{
              bgcolor: CARD,
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
            }}
          >
            <List disablePadding>
              {items.map((item, index) => (
                <React.Fragment key={`${item.PackageId}_${item.Location}`}>
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
                    <Box
                      sx={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: 0.5,
                      }}
                    >
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
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: TEXT_SECONDARY,
                        }}
                      >
                        {item.productId}
                      </Typography>
                    </Box>

                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: TEXT_PRIMARY,
                      }}
                    >
                      {item.category}
                    </Typography>

                    <Box
                      sx={{
                        mt: 0.5,
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        alignItems: "center",
                      }}
                    >
                      <Typography
                        sx={{ fontSize: 12, color: TEXT_SECONDARY }}
                      >
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

                  {index !== items.length - 1 && (
                    <Divider sx={{ mx: 3, borderColor: "#E3E6EE" }} />
                  )}
                </React.Fragment>
              ))}
            </List>
          </Box>
        </Box>
      </Box>

      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          bgcolor: BG,
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Button
          onClick={() => {
            setHasDiscrepancy(false);
            setStep("question");
          }}
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{
            textTransform: "none",
            color: TEXT_SECONDARY,
            fontWeight: 500,
          }}
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

  // STEP 2b – EDIT ITEM
  const renderStepEditItem = () => (
    <>
      {renderHeader("Edit Item Quantity")}

      <DialogContent
        sx={{
          px: 4,
          py: 4,
          bgcolor: BG,
          flex: 1,
          overflowY: "auto",
        }}
      >
        <Box
          sx={{
            backgroundColor: CARD,
            borderRadius: 3,
            p: 3,
            boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: TEXT_SECONDARY,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              mb: 1,
            }}
          >
            Item Description
          </Typography>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              mb: 2,
            }}
          >
            {editingItem?.description}
          </Typography>

          <Box sx={{ display: "grid", gap: 2, mb: 2 }}>
            <TextField
              label="Product ID"
              value={editingItem?.productId || ""}
              disabled
              size="small"
              fullWidth
            />
            <TextField
              label="Category"
              value={editingItem?.category || ""}
              disabled
              size="small"
              fullWidth
            />
            <TextField
              label="Quantity"
              type="number"
              size="small"
              fullWidth
              value={editingItem?.qty ?? ""}
              onChange={(e) =>
                handleEditChange("qty", Number(e.target.value) || 0)
              }
            />
            <TextField
              label="UOM"
              size="small"
              fullWidth
              value={editingItem?.uom || ""}
              disabled
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, bgcolor: BG, flexShrink: 0 }}>
        <Button
          onClick={() => setStep("items")}
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{
            textTransform: "none",
            color: TEXT_SECONDARY,
            fontWeight: 500,
          }}
        >
          Back
        </Button>
        <Button
          onClick={handleEditSave}
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
          Save Item
        </Button>
      </DialogActions>
    </>
  );

  // STEP 3 – SIGNATURE + ATTACHMENTS
  const renderStepSignature = () => (
    <>
      {renderHeader("Capture Proof of Delivery")}

      <DialogContent
        sx={{
          px: 4,
          py: 4,
          bgcolor: BG,
          flex: 1,
          overflowY: "auto",
        }}
      >
        <SignatureAttachmentsSection
          hasDiscrepancy={hasDiscrepancy}
          signatureDataUrl={signature} // dataURL passed in
          onSignatureChange={setSignature} // updates dataURL
          attachments={attachments}
          onAddAttachments={handleFileAdd}
          onRemoveAttachment={handleRemoveAttachment}
          primaryColor={PRIMARY}
          primaryDark={PRIMARY_DARK}
          textPrimary={TEXT_PRIMARY}
          textSecondary={TEXT_SECONDARY}
          cardBg={CARD}
        />
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, bgcolor: BG, flexShrink: 0 }}>
        <Button
          onClick={() =>
            hasDiscrepancy ? setStep("items") : setStep("question")
          }
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{
            textTransform: "none",
            color: TEXT_SECONDARY,
            fontWeight: 500,
          }}
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
      {step === "items" && renderStepItems()}
      {step === "editItem" && renderStepEditItem()}
      {step === "signature" && renderStepSignature()}
    </Dialog>
  );
}
