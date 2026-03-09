// SignatureAttachmentsSection.jsx
import React, { useRef, useEffect, useState } from "react";
import { Box, Typography, Button, Chip, IconButton } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

const DEFAULT_PRIMARY = "#1976D2";
const DEFAULT_PRIMARY_DARK = "#0D47A1";
const DEFAULT_TEXT_PRIMARY = "#071E54";
const DEFAULT_TEXT_SECONDARY = "#6B6C6E";
const DEFAULT_CARD = "#FFFFFF";

export default function SignatureAttachmentsSection({
  hasDiscrepancy,
  signatureDataUrl,
  onSignatureChange,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  primaryColor = DEFAULT_PRIMARY,
  primaryDark = DEFAULT_PRIMARY_DARK,
  textPrimary = DEFAULT_TEXT_PRIMARY,
  textSecondary = DEFAULT_TEXT_SECONDARY,
  cardBg = DEFAULT_CARD,
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // ✅ NEW: separate refs for camera and file picker
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ---- helper: fill canvas with WHITE background ----
  const fillCanvasWhite = (canvas, ctx) => {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    canvas.width = canvas.offsetWidth || 300;
    canvas.height = 140;

    fillCanvasWhite(canvas, ctx);

    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
  };

  useEffect(() => {
    initCanvas();

    const onResize = () => {
      initCanvas();
      restoreSignature(signatureDataUrl);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreSignature = (dataUrl) => {
    if (!dataUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fillCanvasWhite(canvas, ctx);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  };

  useEffect(() => {
    if (signatureDataUrl) restoreSignature(signatureDataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureDataUrl]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  // ✅ auto-save signature when user finishes stroke
  const saveSignatureToParent = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onSignatureChange?.(dataUrl);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveSignatureToParent();
  };

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillCanvasWhite(canvas, ctx);
    onSignatureChange?.("");
  };

  // ✅ NEW: wrap picker change so we reset input value (so same file can be selected twice)
  const handlePickerChange = (e) => {
    onAddAttachments?.(e);
    try {
      e.target.value = "";
    } catch {}
  };

  const fileTypeLabel = (file) => {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();
    if (type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
    if (type.startsWith("image/")) return "IMG";
    return "FILE";
  };

  return (
    <>
      {/* STATUS CHIP */}
      <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Chip
          label={hasDiscrepancy ? "Discrepancy Reported" : "No Item Discrepancy"}
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
          backgroundColor: cardBg,
          borderRadius: 3,
          p: 3,
          mb: 3,
          boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
        }}
      >
        <Typography
          sx={{
            fontSize: 12,
            color: textSecondary,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            mb: 1,
          }}
        >
          Signature (Required)
        </Typography>

        <Box
          sx={{
            mt: 1,
            mb: 1.5,
            borderRadius: 2,
            border: "1px dashed #CBD2E8",
            height: 140,
            bgcolor: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: textSecondary,
            fontSize: 13,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              touchAction: "none",
              cursor: "crosshair",
            }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={endDrawing}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Button
            size="small"
            onClick={handleClearSignature}
            sx={{
              textTransform: "none",
              fontSize: 12,
              color: textSecondary,
            }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      {/* ATTACHMENTS CARD */}
      <Box
        sx={{
          backgroundColor: cardBg,
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
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: textSecondary,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            Attach Files
          </Typography>

          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {/* ✅ Take Photo */}
            <Button
              onClick={() => cameraInputRef.current?.click()}
              startIcon={<PhotoCameraIcon sx={{ fontSize: 18 }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                bgcolor: "rgba(25,118,210,0.08)",
                color: primaryColor,
                "&:hover": { bgcolor: "rgba(25,118,210,0.14)" },
              }}
            >
              Camera
            </Button>

            {/* ✅ Choose Image/PDF */}
            <Button
              onClick={() => fileInputRef.current?.click()}
              startIcon={<UploadFileIcon sx={{ fontSize: 18 }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                bgcolor: "rgba(25,118,210,0.08)",
                color: primaryColor,
                "&:hover": { bgcolor: "rgba(25,118,210,0.14)" },
              }}
            >
              Add
            </Button>
          </Box>

          {/* hidden inputs */}
          <input
            ref={cameraInputRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePickerChange}
          />

          <input
            ref={fileInputRef}
            hidden
            multiple
            type="file"
            accept="image/*,application/pdf"
            onChange={handlePickerChange}
          />
        </Box>

        {!attachments || attachments.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
            No files attached yet. You can add images or PDFs.
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
      width: "100%",
      minWidth: 0,
      gap: 1,
    }}
  >
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <Typography
        noWrap
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: textPrimary,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        [{fileTypeLabel(file)}] {file.name}
      </Typography>

      <Typography noWrap sx={{ fontSize: 11, color: textSecondary }}>
        {(file.size / 1024).toFixed(1)} KB
      </Typography>
    </Box>

    <IconButton
      size="small"
      onClick={() => onRemoveAttachment?.(idx)}
      sx={{ flexShrink: 0 }}
    >
      <DeleteOutlineIcon sx={{ fontSize: 18, color: textSecondary }} />
    </IconButton>
  </Box>
))}

          </Box>
        )}
      </Box>
    </>
  );
}
