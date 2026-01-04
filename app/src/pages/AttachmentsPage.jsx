// src/pages/AttachmentsPage.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItemButton,
  Divider,
  Chip,
  CircularProgress,
  Button,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { Capacitor } from "@capacitor/core";

const BG = "#EFF0F3";
const CARD = "#FFFFFF";
const PRIMARY = "#1976D2";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";

const guessMimeFromFileType = (fileType) => {
  const t = String(fileType || "").toUpperCase().trim();
  if (t === "PDF") return "application/pdf";
  if (t === "PNG") return "image/png";
  if (t === "JPG" || t === "JPEG") return "image/jpeg";
  if (t === "GIF") return "image/gif";
  return "application/octet-stream";
};

const cleanBase64 = (s) => (s || "").toString().split(",").pop();

// ✅ WEB SAFE: convert base64 to Blob URL (no data: navigation)
const base64ToBlobUrl = (base64, mime) => {
  const b64 = cleanBase64(base64);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
  return URL.createObjectURL(blob);
};

export default function AttachmentsPage({
  foId,
  onBack,
  attachmentsUrl = "/odata/v4/GTT/AttachmentsSet",
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const title = "Attachments";

  const fetchAttachments = async () => {
    if (!foId) return;

    try {
      setLoading(true);
      setError("");

      const escFo = String(foId).replace(/'/g, "''");
      const url = `${attachmentsUrl}?$filter=FoId eq '${escFo}'`;

      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Attachments fetch failed (${res.status}). ${txt}`);
      }

      const json = await res.json().catch(() => null);
      const arr = Array.isArray(json?.value) ? json.value : [];
      setRows(arr);
    } catch (e) {
      setRows([]);
      setError(e?.message || "Failed to load attachments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foId]);

  const niceName = (att) =>
    att?.FileName || att?.Description || att?.FileType || "Attachment";

  // ✅ FINAL: view-only open (Web: Blob URL, Native: cache file + Browser.open)
  const openAttachment = async (att) => {
    const base64 = att?.PDFBase64 || att?.Content || "";
    if (!base64) {
      alert("This attachment does not contain file content (PDFBase64/Content is empty).");
      return;
    }

    const mime = att?.MimeCode || guessMimeFromFileType(att?.FileType);
    const fileType = String(att?.FileType || "").toLowerCase().trim() || "bin";

    // best-effort filename (no download usage; used only for device cache path)
    const rawName =
      att?.FileName ||
      att?.Description ||
      `FO_${foId || "attachment"}.${fileType}`;

    const isNative = Capacitor.isNativePlatform();

    // =====================
    // 🌐 WEB: Open in new tab (VIEW ONLY)
    // =====================
    if (!isNative) {
      const blobUrl = base64ToBlobUrl(base64, mime);

      // Open the blob URL (no data: URL)
      window.open(blobUrl, "_blank", "noopener,noreferrer");

      // cleanup later
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return;
    }

    // =====================
    // 📱 ANDROID/iOS: Write to cache + open (VIEW ONLY)
    // Requires:
    //   npm i @capacitor/filesystem @capacitor/browser
    //   npx cap sync
    // =====================
    try {
      const [{ Filesystem, Directory }, { Browser }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/browser"),
      ]);

      const data = cleanBase64(base64);
      const safeName = String(rawName).replace(/[^a-z0-9._-]/gi, "_");
      const path = `attachments/${Date.now()}_${safeName}`;

      await Filesystem.writeFile({
        path,
        data,
        directory: Directory.Cache,
      });

      const fileUri = await Filesystem.getUri({
        directory: Directory.Cache,
        path,
      });

      // Open in system viewer
      await Browser.open({ url: fileUri.uri });
    } catch (e) {
      console.error("Native openAttachment failed:", e);
      alert(
        "Attachment open failed on device. Make sure @capacitor/filesystem and @capacitor/browser are installed and synced."
      );
    }
  };

  const count = rows.length;

  return (
    <Box
      sx={{
        width: "100%",
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

        <Box sx={{ textAlign: "center", flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>
            {title}
          </Typography>
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
            {foId ? `FO: ${foId}` : "No Freight Order Selected"}
          </Typography>
        </Box>

        <IconButton
          size="small"
          onClick={fetchAttachments}
          sx={{ color: PRIMARY }}
          disabled={!foId || loading}
        >
          <RefreshRoundedIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>

      {/* SUMMARY */}
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
          <Typography
            sx={{
              fontSize: 11,
              color: TEXT_SECONDARY,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontWeight: 700,
            }}
          >
            Total Attachments : {loading ? "…" : count}
          </Typography>

          {loading ? (
            <CircularProgress size={18} />
          ) : (
            <Chip
              size="small"
              label={error ? "Error" : "Ready"}
              sx={{
                bgcolor: error ? "rgba(237,108,2,0.12)" : "rgba(46,125,50,0.12)",
                color: error ? "#ED6C02" : "#2E7D32",
                fontWeight: 700,
              }}
            />
          )}
        </Box>

        {error ? (
          <Box sx={{ mt: 1, px: 0.5 }}>
            <Typography sx={{ fontSize: 12, color: "#ED6C02", fontWeight: 600 }}>
              {error}
            </Typography>
          </Box>
        ) : null}
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
        {!foId && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY }}>
              Please search and open a Freight Order to view attachments.
            </Typography>
          </Box>
        )}

        {foId && loading && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: "italic" }}>
              Loading attachments…
            </Typography>
          </Box>
        )}

        {foId && !loading && rows.length === 0 && !error && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY }}>
              No attachments found for this Freight Order.
            </Typography>
          </Box>
        )}

        {foId && !loading && rows.length > 0 && (
          <List disablePadding sx={{ pt: 0.5 }}>
            {rows.map((att, idx) => {
              const hasContent = Boolean(att?.PDFBase64 || att?.Content);
              const rightLabel = att?.FileType || (att?.MimeCode ? "FILE" : "");

              return (
                <React.Fragment key={`${att?.FileName || idx}-${idx}`}>
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
                    <Box
                      sx={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: TEXT_PRIMARY,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={niceName(att)}
                        >
                          {niceName(att)}
                        </Typography>

                        <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY, mt: 0.4 }}>
                          {att?.Description ? `Desc: ${att.Description}` : "—"}
                        </Typography>

                        <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY, mt: 0.2 }}>
                          {att?.CreatedBy ? `By: ${att.CreatedBy}` : ""}
                        </Typography>
                      </Box>

                      {rightLabel ? (
                        <Chip
                          size="small"
                          label={rightLabel}
                          sx={{
                            bgcolor: "rgba(25,118,210,0.08)",
                            color: PRIMARY,
                            fontWeight: 800,
                          }}
                        />
                      ) : null}
                    </Box>

                    <Box sx={{ mt: 1, width: "100%", display: "flex", gap: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<OpenInNewRoundedIcon />}
                        onClick={() => openAttachment(att)}
                        disabled={!hasContent}
                        sx={{
                          textTransform: "none",
                          bgcolor: PRIMARY,
                          "&:hover": { bgcolor: "#0D47A1" },
                          borderRadius: 2,
                          fontWeight: 700,
                        }}
                      >
                        Open
                      </Button>

                      {!hasContent ? (
                        <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY, mt: 0.8 }}>
                          (No PDFBase64 content)
                        </Typography>
                      ) : null}
                    </Box>
                  </ListItemButton>

                  {idx !== rows.length - 1 && (
                    <Divider
                      component="li"
                      sx={{ mx: 2, mb: 0.2, borderColor: "transparent" }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>

      <Box sx={{ height: 8, bgcolor: CARD }} />
    </Box>
  );
}
