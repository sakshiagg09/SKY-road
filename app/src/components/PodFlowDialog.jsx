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

// COLORS (aligned with ShipmentDetails / ReportEvent)
const PRIMARY = "#1976D2";
const PRIMARY_DARK = "#0D47A1";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";
const BG = "#EFF0F3";
const CARD = "#FFFFFF";

// Hard-coded items (like SKY 1.0)
const INITIAL_ITEMS = [
  {
    id: "PACK_TRUCK_1",
    description: "packing material",
    category: "PKG",
    productId: "PACK_TRUCK",
    qty: 1,
    uom: "ST",
  },
  {
    id: "LECITHIN_5",
    description: "Lecithin",
    category: "PRD",
    productId: "1000000001",
    qty: 5,
    uom: "ST",
  },
  {
    id: "PACK_TRUCK_2",
    description: "packing material",
    category: "PKG",
    productId: "PACK_TRUCK",
    qty: 1,
    uom: "ST",
  },
  {
    id: "LECITHIN_15",
    description: "Lecithin",
    category: "PRD",
    productId: "1000000001",
    qty: 15,
    uom: "ST",
  },
];

export default function PodFlowDialog({ open, stop, foId, onClose, onSubmit }) {
  const [step, setStep] = useState("question"); // 'question' | 'discrepancyList' | 'editItem' | 'signature'
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [editingItem, setEditingItem] = useState(null);
  const [signature, setSignature] = useState(""); // placeholder string
  const [attachments, setAttachments] = useState([]); // [{name, size}]
  const [hasDiscrepancy, setHasDiscrepancy] = useState(false);

  // reset when dialog closes
  React.useEffect(() => {
    if (!open) {
      setStep("question");
      setItems(INITIAL_ITEMS);
      setEditingItem(null);
      setSignature("");
      setAttachments([]);
      setHasDiscrepancy(false);
    }
  }, [open]);

  const stopTitle =
    stop?.name1 || stop?.locid || stop?.stopid || "Selected Stop";

  const handleNoDiscrepancy = () => {
    setHasDiscrepancy(false);
    setStep("signature");
  };

  const handleYesDiscrepancy = () => {
    setHasDiscrepancy(true);
    setStep("discrepancyList");
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setStep("editItem");
  };

  const handleEditSave = () => {
    if (!editingItem) return;
    setItems((prev) =>
      prev.map((i) => (i.id === editingItem.id ? editingItem : i))
    );
    setStep("discrepancyList");
  };

  const handleEditChange = (field, value) => {
    setEditingItem((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileAdd = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setAttachments((prev) => [
      ...prev,
      ...files.map((f) => ({ name: f.name, size: f.size })),
    ]);
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitPod = () => {
    const payload = {
      FoId: foId,
      stopId: stop?.stopid || stop?.locid,
      hasDiscrepancy,
      items,
      signature, // placeholder string – hook to real pad later
      attachments,
      createdAt: new Date().toISOString(),
    };
    if (typeof onSubmit === "function") onSubmit(payload);
    else console.log("POD payload (mock):", payload);
  };

  const closeDialog = () => {
    if (typeof onClose === "function") onClose();
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
        flexShrink: 0, // 👈 NEW: header won't shrink when height is tight
      }}
    >
      {/* subtle pattern */}
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
              <Typography
                sx={{ color: "#fff", fontSize: 20, fontWeight: 700 }}
              >
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <IconButton
            onClick={closeDialog}
            sx={{
              color: "#fff",
              backgroundColor: "rgba(255, 255, 255, 0.18)",
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.28)",
              },
            }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        {/* Freight ID pill */}
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
              {foId || "Not Selected"}
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
          flex: 1, // 👈 NEW: content takes remaining height
          overflowY: "auto", // 👈 NEW: scroll inside dialog on small screens
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

          <Typography
            sx={{
              fontSize: 13,
              color: TEXT_SECONDARY,
              mb: 3,
            }}
          >
            Choose <strong>Yes</strong> to adjust quantities, or{" "}
            <strong>No</strong> to continue directly to Proof of Delivery.
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

      <DialogActions
        sx={{
          px: 4,
          py: 2.5,
          bgcolor: BG,
          flexShrink: 0, // 👈 NEW: keep actions visible
        }}
      >
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

  // STEP 2 – DISCREPANCY LIST
  const renderStepDiscrepancyList = () => (
    <>
      {renderHeader("Item Discrepancy Reporting")}

      <DialogContent
        sx={{
          px: 0,
          py: 0,
          bgcolor: BG,
          flex: 1, // 👈 NEW
          overflowY: "auto", // 👈 NEW
        }}
      >
        <Box
          sx={{
            px: 3,
            pt: 3,
            pb: 1.5,
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: TEXT_SECONDARY,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              mb: 0.5,
            }}
          >
            Shipment Leg
          </Typography>
          <Typography
            sx={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}
          >
            {stopTitle}
          </Typography>
        </Box>

        <Divider />

        <Box
          sx={{
            // on very small screens let outer DialogContent control height
            maxHeight: { xs: "none", sm: 340 }, // 👈 UPDATED
            overflowY: "auto",
            bgcolor: CARD,
          }}
        >
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
                  {/* first row */}
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

                  {/* second row */}
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    {item.category}
                  </Typography>

                  {/* third row */}
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
                      sx={{
                        fontSize: 12,
                        color: TEXT_SECONDARY,
                      }}
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
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          bgcolor: BG,
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0, // 👈 NEW
        }}
      >
        <Button
          onClick={() => setStep("question")}
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
          sx={{
            textTransform: "none",
            color: TEXT_SECONDARY,
            fontWeight: 500,
          }}
        >
          Back
        </Button>

        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Button
            onClick={handleNoDiscrepancy}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              border: "1px solid #CBD2E8",
              color: TEXT_SECONDARY,
              bgcolor: "#F8FAFF",
              "&:hover": { bgcolor: "#EEF3FF" },
            }}
          >
            Clear Discrepancy
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
        </Box>
      </DialogActions>
    </>
  );

  // STEP 3 – EDIT ITEM
  const renderStepEditItem = () => (
    <>
      {renderHeader("Edit Item Quantity")}

      <DialogContent
        sx={{
          px: 4,
          py: 4,
          bgcolor: BG,
          flex: 1, // 👈 NEW
          overflowY: "auto", // 👈 NEW
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
            sx={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY, mb: 2 }}
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

      <DialogActions
        sx={{
          px: 4,
          py: 2.5,
          bgcolor: BG,
          flexShrink: 0, // 👈 NEW
        }}
      >
        <Button
          onClick={() => setStep("discrepancyList")}
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

  // STEP 4 – SIGNATURE & ATTACHMENTS
  const renderStepSignature = () => (
    <>
      {renderHeader("Capture Proof of Delivery")}

      <DialogContent
        sx={{
          px: 4,
          py: 4,
          bgcolor: BG,
          flex: 1, // 👈 NEW
          overflowY: "auto", // 👈 NEW
        }}
      >
        {/* Discrepancy summary badge */}
        <Box
          sx={{
            mb: 2.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Chip
            label={
              hasDiscrepancy ? "Discrepancy Reported" : "No Item Discrepancy"
            }
            sx={{
              bgcolor: hasDiscrepancy
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(16, 185, 129, 0.12)",
              color: hasDiscrepancy ? "#B45309" : "#047857",
              fontWeight: 600,
            }}
          />
        </Box>

        {/* SIGNATURE CARD */}
        <Box
          sx={{
            backgroundColor: CARD,
            borderRadius: 3,
            p: 3,
            mb: 3,
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
            Signature
          </Typography>

          {/* Signature pad placeholder */}
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
            {/* Here you can integrate react-signature-canvas later */}
            Tap here to capture signature (placeholder)
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5 }}>
            <Button
              size="small"
              onClick={() => setSignature("")}
              sx={{
                textTransform: "none",
                fontSize: 12,
                color: TEXT_SECONDARY,
              }}
            >
              Clear
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => setSignature("signed")}
              sx={{
                textTransform: "none",
                fontSize: 12,
                bgcolor: PRIMARY,
                "&:hover": { bgcolor: PRIMARY_DARK },
              }}
            >
              Save
            </Button>
          </Box>
        </Box>

        {/* ATTACHMENTS CARD */}
        <Box
          sx={{
            backgroundColor: CARD,
            borderRadius: 3,
            p: 3,
            boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                color: TEXT_SECONDARY,
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
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
              <input
                hidden
                multiple
                type="file"
                onChange={handleFileAdd}
              />
            </Button>
          </Box>

          {attachments.length === 0 ? (
            <Typography
              sx={{
                fontSize: 12,
                color: TEXT_SECONDARY,
              }}
            >
              No files attached yet.
            </Typography>
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
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: TEXT_PRIMARY,
                      }}
                    >
                      {file.name}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 11, color: TEXT_SECONDARY }}
                    >
                      {(file.size / 1024).toFixed(1)} KB
                    </Typography>
                  </Box>

                  <IconButton
                    size="small"
                    onClick={() => handleRemoveAttachment(idx)}
                  >
                    <DeleteOutlineIcon
                      sx={{ fontSize: 18, color: TEXT_SECONDARY }}
                    />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 4,
          py: 2.5,
          bgcolor: BG,
          flexShrink: 0, // 👈 NEW
        }}
      >
        <Button
          onClick={() =>
            hasDiscrepancy ? setStep("discrepancyList") : setStep("question")
          }
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
          onClick={handleSubmitPod}
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
          Submit POD
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
          display: "flex", // 👈 NEW: make Paper a flex column
          flexDirection: "column", // 👈 NEW
          maxHeight: "calc(100vh - 32px)", // 👈 NEW: keep some margin on small screens
          m: 2, // same look on desktop & mobile (keeps it off edges a bit)
        },
      }}
    >
      {step === "question" && renderStepQuestion()}
      {step === "discrepancyList" && renderStepDiscrepancyList()}
      {step === "editItem" && renderStepEditItem()}
      {step === "signature" && renderStepSignature()}
    </Dialog>
  );
}
