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

  const stopAll = async () => {
    if (!mountedRef.current) return;
    setScanning(false);

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
  };

  const handleClose = async () => {
    await stopAll();
    onClose && onClose();
  };

  // ---------------- NATIVE (Capacitor Android/iOS) ----------------
  const startNativeScan = async () => {
    try {
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

      // Ask permission
      const perm = await BarcodeScanner.requestPermissions();
      const ok =
        perm?.camera === "granted" ||
        perm?.camera === "limited" ||
        perm === "granted";

      if (!ok) {
        throw new Error("Camera permission not granted.");
      }

      // Optional: make background transparent so camera view shows
      // (Plugin uses native view overlay; on many apps this just works)
      // If you face black screen, tell me and I’ll add the “hide background” approach.
      const result = await BarcodeScanner.scan({
        // supports barcodes + QR
        // If you want only barcodes, we can restrict formats later.
      });

      const value = result?.barcodes?.[0]?.rawValue || result?.barcodes?.[0]?.displayValue;

      if (!value) {
        throw new Error("No barcode detected. Try again.");
      }

      onScan && onScan(value);
      await stopAll();
      onClose && onClose();
    } catch (e) {
      console.error("Native scan failed:", e);
      if (!mountedRef.current) return;
      setError(e?.message || "Native scanner failed.");
      setScanning(false);
    }
  };

  // ---------------- WEB FALLBACK ----------------
  const startWebScan = async () => {
    try {
      setError("");
      setScanning(true);

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
      setError(e?.message || "Web scanner failed.");
      setScanning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2, m: 2 } }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Typography variant="h6" component="div">
          Scan Freight Order Barcode
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
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
              }}
            >
              <Typography color="error" align="center">
                {error}
              </Typography>

              <Button
                variant="contained"
                onClick={() => (isNative ? startNativeScan() : startWebScan())}
              >
                Retry
              </Button>
            </Box>
          ) : (
            <>
              {/* Web only preview box */}
              {!isNative ? (
                <>
                  <div id={regionIdRef.current} style={{ width: "100%" }} />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    align="center"
                    sx={{ mt: 2 }}
                  >
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
                  }}
                >
                  <Typography align="center" color="text.secondary">
                    Opening native scanner…
                  </Typography>
                  <Typography align="center" sx={{ fontSize: 12, color: "text.secondary" }}>
                    If it doesn’t open, tap Retry.
                  </Typography>
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        {/* Optional manual start button */}
        {!scanning && !error ? (
          <Button
            variant="contained"
            onClick={() => (isNative ? startNativeScan() : startWebScan())}
          >
            Start
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
