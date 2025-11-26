import React from "react";
import { AppBar, Toolbar, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export default function TopBar({ title = "Sky Road", onBack }) {
  return (
    <AppBar
      position="static"
      elevation={0}
      className="bg-sapBackground border-b border-sapBorder"
    >
      <Toolbar className="flex items-center px-3">
        <IconButton edge="start" color="inherit" onClick={onBack}>
          <CloseIcon className="text-sapTextPrimary" />
        </IconButton>

        <Typography
          variant="h6"
          className="flex-1 ml-2 text-sapTextPrimary font-semibold tracking-wide"
        >
          {title}
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
