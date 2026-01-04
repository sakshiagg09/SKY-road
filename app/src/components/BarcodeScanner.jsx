// src/components/BarcodeScanner.jsx
import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar"; // ✅ for native overlay handling

// Web fallback
import { Html5Qrcode } from "html5-qrcode";

const BarcodeScanner = ({ open, onClose, onScan }) => {
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  // web scanner refs
  const html5QrCodeRef = useRef(null);
  const mountedRef = useRef(false);
  const regionIdRef = useRef(`qr-reader-${Math.random().toString(16).slice(2)}`);

  const isNative = Capacitor.isNativePlatform();

  // track if we made WebView transparent (native)
  const nativeOverlayAppliedRef = useRef(false);
  const previousHtmlBgRef = useRef("");
  const previousBodyBgRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;

    if (open) {
      setError("");
      setScanning(true);

      // start after dialog mounts
      const t = setTimeout(() => {
        isNative ? startNativeScan() : startWebScan();
      }, 150);

      return () => clearTimeout(t);
    } else {
      stopAll();
    }

    return () => {
      mountedRef.current = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const safeSetState = (fn) => {
    if (mountedRef.current) fn();
  };

  const applyNativeOverlay = async () => {
    if (!isNative || nativeOverlayAppliedRef.current) return;

    // store previous backgrounds
    previousHtmlBgRef.current = document.documentElement.style.backgroundColor || "";
    previousBodyBgRef.current = document.body.style.backgroundColor || "";

    // make WebView transparent so camera below becomes visible
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";

    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch (_) {}

    nativeOverlayAppliedRef.current = true;
  };

  const restoreNativeOverlay = async () => {
    if (!isNative || !nativeOverlayAppliedRef.current) return;

    // restore backgrounds
    document.documentElement.style.backgroundColor = previousHtmlBgRef.current;
    document.body.style.backgroundColor = previousBodyBgRef.current;

    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch (_) {}

    nativeOverlayAppliedRef.current = false;
  };

  const stopAll = async () => {
    // stop web scanner if any
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (_) {}
        try {
          await html5QrCodeRef.current.clear();
        } catch (_) {}
        html5QrCodeRef.current = null;
      }
    } catch (_) {}

    // restore native overlay if applied
    try {
      await restoreNativeOverlay();
    } catch (_) {}

    safeSetState(() => setScanning(false));
  };

  const handleClose = async () => {
    await stopAll();
    onClose && onClose();
  };

  // ---------------- NATIVE (Capacitor Android/iOS) ----------------
  const startNativeScan = async () => {
    try {
      safeSetState(() => {
        setError("");
        setScanning(true);
      });

      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

      // ✅ Ensure camera permission (Android needs CAMERA in manifest too!)
      const perm = await BarcodeScanner.requestPermissions();
      const cameraState = perm?.camera || perm; // plugin versions differ
      const ok = cameraState === "granted" || cameraState === "limited";

      if (!ok) {
        throw new Error("Camera permission not granted. Please allow camera access.");
      }

      // ✅ Important: allow native camera view to show behind WebView/dialog
      await applyNativeOverlay();

      const result = await BarcodeScanner.scan();

      const value =
        result?.barcodes?.[0]?.rawValue ||
        result?.barcodes?.[0]?.displayValue ||
        result?.barcodes?.[0]?.value;

      if (!value) {
        throw new Error("No barcode detected. Try again.");
      }

      onScan && onScan(value);
      await stopAll();
      onClose && onClose();
    } catch (e) {
      console.error("Native scan failed:", e);
      if (!mountedRef.current) return;

      // restore overlay so UI becomes normal again
      try {
        await restoreNativeOverlay();
      } catch (_) {}

      safeSetState(() => {
        setError(e?.message || "Native scanner failed.");
        setScanning(false);
      });
    }
  };

  // ---------------- WEB FALLBACK ----------------
  const startWebScan = async () => {
    try {
      safeSetState(() => {
        setError("");
        setScanning(true);
      });

      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) throw new Error("No camera found.");

      const backCamera = devices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId =
        backCamera?.id ||
        backCamera?.deviceId ||
        devices[0]?.id ||
        devices[0]?.deviceId;

      const html5QrCode = new Html5Qrcode(regionIdRef.current, false);
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 12,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
        formatsToSupport: [
          Html5Qrcode.SUPPORTED_FORMATS.QR_CODE,
          Html5Qrcode.SUPPORTED_FORMATS.CODE_128,
          Html5Qrcode.SUPPORTED_FORMATS.CODE_39,
          Html5Qrcode.SUPPORTED_FORMATS.EAN_13,
          Html5Qrcode.SUPPORTED_FORMATS.EAN_8,
          Html5Qrcode.SUPPORTED_FORMATS.UPC_A,
          Html5Qrcode.SUPPORTED_FORMATS.UPC_E,
          Html5Qrcode.SUPPORTED_FORMATS.ITF,
          Html5Qrcode.SUPPORTED_FORMATS.CODABAR,
          Html5Qrcode.SUPPORTED_FORMATS.PDF_417,
        ],
      };

      await html5QrCode.start(
        deviceId,
        config,
        async (decodedText) => {
          await stopAll();
          onScan && onScan(decodedText);
          onClose && onClose();
        },
        () => {}
      );
    } catch (e) {
      console.error("Web scan failed:", e);
      if (!mountedRef.current) return;
      safeSetState(() => {
        setError(e?.message || "Web scanner failed.");
        setScanning(false);
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      // ✅ When native: make dialog transparent so it doesn't block camera view
      PaperProps={{
        sx: isNative
          ? { background: "transparent", boxShadow: "none", m: 0 }
          : { borderRadius: 2, m: 2 },
      }}
      // ✅ Also avoid a dark backdrop blocking view (native)
      BackdropProps={{
        sx: isNative ? { backgroundColor: "transparent" } : undefined,
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
          // ✅ Native: keep title readable on camera
          backgroundColor: isNative ? "rgba(0,0,0,0.35)" : "transparent",
          color: isNative ? "#fff" : "inherit",
        }}
      >
        <Typography variant="h6" component="div">
          Scan Freight Order Barcode
        </Typography>
        <IconButton onClick={handleClose} size="small" sx={{ color: isNative ? "#fff" : "inherit" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          // ✅ Native: keep content transparent so camera visible
          backgroundColor: isNative ? "transparent" : "inherit",
          pt: 1,
        }}
      >
        <Box sx={{ width: "100%", minHeight: 320 }}>
          {error ? (
            <Box
              sx={{
                minHeight: 320,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
                p: 2,
                backgroundColor: isNative ? "rgba(0,0,0,0.45)" : "transparent",
                borderRadius: 2,
              }}
            >
              <Typography color="error" align="center">
                {error}
              </Typography>

              <Button variant="contained" onClick={() => (isNative ? startNativeScan() : startWebScan())}>
                Retry
              </Button>
            </Box>
          ) : (
            <>
              {!isNative ? (
                <>
                  <div id={regionIdRef.current} style={{ width: "100%" }} />
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2 }}>
                    Position the barcode within the frame
                  </Typography>
                </>
              ) : (
                <Box
                  sx={{
                    minHeight: 320,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 1,
                    backgroundColor: "rgba(0,0,0,0.25)",
                    borderRadius: 2,
                    p: 2,
                    color: "#fff",
                  }}
                >
                  <Typography align="center" sx={{ color: "#fff" }}>
                    Opening native scanner…
                  </Typography>
                  <Typography align="center" sx={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>
                    If it doesn’t open, tap Retry.
                  </Typography>
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          backgroundColor: isNative ? "rgba(0,0,0,0.35)" : "transparent",
        }}
      >
        <Button onClick={handleClose} color="inherit" sx={{ color: isNative ? "#fff" : "inherit" }}>
          Cancel
        </Button>

        {!scanning && !error ? (
          <Button variant="contained" onClick={() => (isNative ? startNativeScan() : startWebScan())}>
            Start
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
