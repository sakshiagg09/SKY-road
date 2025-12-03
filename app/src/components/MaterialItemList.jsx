// src/components/MaterialItemList.jsx
import React from "react";
import {
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItemButton,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";

// Color palette aligned with ShipmentDetails / ReportEvent
const BG = "#EFF0F3";
const CARD = "#FFFFFF";
const PRIMARY = "#1976D2";
const TEXT_PRIMARY = "#071E54";
const TEXT_SECONDARY = "#6B6C6E";

// Hard-coded demo items (similar to your screenshot)
const MOCK_ITEMS = [
  {
    id: "PACK_TRUCK_1",
    materialName: "packing material",
    materialType: "PKG",
    packaging: "PACK_TRUCK",
    qty: 1,
  },
  {
    id: "LECITHIN_5",
    materialName: "Lecithin",
    materialType: "PRD",
    materialNumber: "1000000001",
    qty: 5,
  },
  {
    id: "PACK_TRUCK_2",
    materialName: "packing material",
    materialType: "PKG",
    packaging: "PACK_TRUCK",
    qty: 1,
  },
  {
    id: "LECITHIN_15",
    materialName: "Lecithin",
    materialType: "PRD",
    materialNumber: "1000000001",
    qty: 15,
  },
];

export default function MaterialItemList({ onBack, onConfirm }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
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
        <IconButton
          size="small"
          onClick={onBack}
          sx={{ color: PRIMARY }}
        >
          <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
        </IconButton>

        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: TEXT_PRIMARY,
          }}
        >
          Material Item List
        </Typography>

        <IconButton
          size="small"
          onClick={onConfirm}
          sx={{ color: PRIMARY }}
        >
          <CheckIcon sx={{ fontSize: 22 }} />
        </IconButton>
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
        <List disablePadding>
          {MOCK_ITEMS.map((item, index) => (
            <React.Fragment key={item.id}>
              <ListItemButton
                disableRipple
                sx={{
                  alignItems: "flex-start",
                  flexDirection: "column",
                  py: 1.5,
                  px: 2.2,
                  "&:hover": { backgroundColor: "#F7F8FC" },
                }}
              >
                {/* First row: material name + right side (packaging / material no) */}
                <Box
                  sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 1,
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
                    {item.materialName}
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: TEXT_SECONDARY,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.packaging || item.materialNumber || ""}
                  </Typography>
                </Box>

                {/* Second row: type + maybe again code */}
                <Box
                  sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 0.25,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    {item.materialType}
                  </Typography>

                  {/* to keep it visually close but not cluttered,
                      we don't repeat right-side text here */}
                </Box>

                {/* Third row: quantity */}
                <Typography
                  sx={{
                    fontSize: 12,
                    color: TEXT_SECONDARY,
                  }}
                >
                  {item.qty}
                </Typography>
              </ListItemButton>

              {index !== MOCK_ITEMS.length - 1 && (
                <Divider
                  component="li"
                  sx={{ ml: 2, mr: 2, borderColor: "#E3E6EE" }}
                />
              )}
            </React.Fragment>
          ))}
        </List>
      </Box>

      {/* Optional bottom safe area (for devices with gesture bar) */}
      <Box sx={{ height: 8, bgcolor: CARD }} />
    </Box>
  );
}
