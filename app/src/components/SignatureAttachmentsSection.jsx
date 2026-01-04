// SignatureAttachmentsSection.jsx
import React, { useRef, useEffect, useState } from "react";
import { Box, Typography, Button, Chip, IconButton } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

const DEFAULT_PRIMARY = "#1976D2";
const DEFAULT_PRIMARY_DARK = "#0D47A1";
const DEFAULT_TEXT_PRIMARY = "#071E54";
const DEFAULT_TEXT_SECONDARY = "#6B6C6E";
const DEFAULT_CARD = "#FFFFFF";

/**
 * Props:
 *  - hasDiscrepancy: boolean
 *  - signatureDataUrl: string (data:image/jpeg;base64,...)  // from parent
 *  - onSignatureChange: (dataUrl: string) => void
 *  - attachments: File[]
 *  - onAddAttachments: (event) => void
 *  - onRemoveAttachment: (index: number) => void
 */
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

    // set dimensions
    canvas.width = canvas.offsetWidth || 300;
    canvas.height = 140;

    // white bg
    fillCanvasWhite(canvas, ctx);

    // pen style
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
  };

  // init canvas once
  useEffect(() => {
    initCanvas();

    // handle resize (optional but helps on responsive dialogs)
    const onResize = () => {
      // re-init (will clear), then restore signature if present
      initCanvas();
      restoreSignature(signatureDataUrl);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // restore signatureDataUrl into canvas (if parent already has one)
  const restoreSignature = (dataUrl) => {
    if (!dataUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const img = new Image();
    img.onload = () => {
      // clear and fill white
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fillCanvasWhite(canvas, ctx);

      // fit image to canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  };

  useEffect(() => {
    // whenever parent signature changes externally, redraw it
    if (signatureDataUrl) restoreSignature(signatureDataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureDataUrl]);

  // ---- pointer helpers ----
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

    // canvas already has white bg; export as JPG
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onSignatureChange?.(dataUrl);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveSignatureToParent();
  };

  // ---- actions: clear only ----
  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillCanvasWhite(canvas, ctx);

    onSignatureChange?.(""); // clear in parent
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

          <Button
            component="label"
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
            <input hidden multiple type="file" onChange={onAddAttachments} />
          </Button>
        </Box>

        {!attachments || attachments.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
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
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>
                    {file.name}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: textSecondary }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>

                <IconButton size="small" onClick={() => onRemoveAttachment?.(idx)}>
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
