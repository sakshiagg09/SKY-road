import React from "react";
import { BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";

export default function BottomBar({ value, setValue }) {
  return (
    <Paper
      elevation={8}
      className="bg-sapSurface border-t border-sapBorder fixed bottom-0 left-0 right-0"
    >
      <BottomNavigation
        value={value}
        onChange={(e, newValue) => setValue(newValue)}
        className="bg-sapSurface text-sapTextPrimary"
        showLabels
      >
        <BottomNavigationAction
          label="Home"
          icon={<HomeIcon />}
          className="text-sapTextSecondary"
        />
        <BottomNavigationAction
          label="Shipments"
          icon={<LocalShippingIcon />}
          className="text-sapTextSecondary"
        />
        <BottomNavigationAction
          label="Scan"
          icon={<QrCodeScannerIcon />}
          className="text-sapTextSecondary"
        />
      </BottomNavigation>

      <div className="text-center py-2 text-[11px] text-sapTextSecondary bg-sapSurface border-t border-sapBorder">
        © NAV IT Consulting
      </div>
    </Paper>
  );
}
