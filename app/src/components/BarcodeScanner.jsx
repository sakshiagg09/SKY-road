import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
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

const BarcodeScanner = ({ open, onClose, onScan }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const html5QrCodeRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    if (open) {
      startScanning();
    }

    return () => {
      mountedRef.current = false;
      stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startScanning = async () => {
    try {
      setError(null);
      setScanning(true);

      const devices = await Html5Qrcode.getCameras();

      if (!mountedRef.current) return;

      if (devices && devices.length > 0) {
        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        const html5QrCode = new Html5Qrcode("qr-reader", /* verbose= */ false);
        html5QrCodeRef.current = html5QrCode;

        // Prefer back camera if label indicates so
        const backCamera = devices.find((d) =>
          /back|rear|environment/i.test(d.label)
        );
        const deviceId =
          backCamera?.id ||
          backCamera?.deviceId ||
          devices[0].id ||
          devices[0].deviceId;

        // 🔴 FIX 1: pass a *single* cameraIdOrConfig value (string),
        // not { deviceIdOrCameraId, facingMode }
        await html5QrCode.start(
          deviceId,
          config,
          (decodedText, decodedResult) => {
            handleSuccessfulScan(decodedText);
          },
          (err) => {
            // ignore common "no qr code" errors while scanning
          }
        );
      } else {
        setError("No camera found on device");
        setScanning(false);
      }
    } catch (err) {
      console.error("Error starting scanner:", err);
      setError("Failed to start camera. Please check camera permissions.");
      setScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {
          // ignore "already stopped" errors
        }
        try {
          await html5QrCodeRef.current.clear();
        } catch (e) {
          // ignore
        }
        html5QrCodeRef.current = null;
      }
    } catch (err) {
      console.error("Error stopping scanner:", err);
    }

    if (mountedRef.current) {
      setScanning(false);
    }
  };

  const handleSuccessfulScan = (decodedText) => {
    stopScanning();
    try {
      onScan && onScan(decodedText);
    } catch (e) {
      console.error("onScan handler error:", e);
    } finally {
      onClose && onClose();
    }
  };

  const handleClose = () => {
    stopScanning();
    onClose && onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          m: 2,
        },
      }}
    >
      {/* 🔴 FIX 2: avoid <h2> wrapping <h6> */}
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
        <Box sx={{ position: "relative", width: "100%", minHeight: 300 }}>
          {error ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
                p: 3,
              }}
            >
              <Typography color="error" align="center" sx={{ mb: 2 }}>
                {error}
              </Typography>
              <Button variant="contained" onClick={startScanning}>
                Retry
              </Button>
            </Box>
          ) : (
            <>
              <div id="qr-reader" style={{ width: "100%" }} />
              <Typography
                variant="body2"
                color="text.secondary"
                align="center"
                sx={{ mt: 2 }}
              >
                Position the barcode within the frame
              </Typography>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
