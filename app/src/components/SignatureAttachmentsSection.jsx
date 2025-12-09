// SignatureAttachmentsSection.jsx
import React, { useRef, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
} from "@mui/material";
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
 *  - signatureDataUrl: string (data:image/jpeg;base64,...)  // 👈 from parent
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
    ctx.fillStyle = "#FFFFFF";           // WHITE BG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  // init canvas: white background, black pen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // set dimensions (you can tweak)
    canvas.width = canvas.offsetWidth || 300;
    canvas.height = 140;

    // fill white ONCE at start
    fillCanvasWhite(canvas, ctx);

    // pen style
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";     // BLACK signature

    // if you want to restore existing signatureDataUrl, you can draw it back here
    // but usually we only go from canvas -> dataUrl (not reverse)
  }, []);

  // ---- pointer events ----
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
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();                 // draws black line
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  // ---- actions: clear & save ----
  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    // clear to transparent, then fill white again
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillCanvasWhite(canvas, ctx);
    onSignatureChange?.("");       // clear in parent
  };

  const handleSaveSignature = () => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  // ✅ Do NOT call fillCanvasWhite here
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  onSignatureChange?.(dataUrl);
};

  return (
    <>
      {/* STATUS CHIP */}
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
          Signature
        </Typography>

        <Box
          sx={{
            mt: 1,
            mb: 1.5,
            borderRadius: 2,
            border: "1px dashed #CBD2E8",
            height: 140,
            bgcolor: "#FFFFFF", // white visual background
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
            justifyContent: "space-between",
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

          <Button
            size="small"
            variant="contained"
            onClick={handleSaveSignature}
            sx={{
              textTransform: "none",
              fontSize: 12,
              bgcolor: primaryColor,
              "&:hover": { bgcolor: primaryDark },
            }}
          >
            Save Signature
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
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
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
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: textPrimary,
                    }}
                  >
                    {file.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: textSecondary,
                    }}
                  >
                    {(file.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  onClick={() => onRemoveAttachment?.(idx)}
                >
                  <DeleteOutlineIcon
                    sx={{ fontSize: 18, color: textSecondary }}
                  />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </>
  );
}
