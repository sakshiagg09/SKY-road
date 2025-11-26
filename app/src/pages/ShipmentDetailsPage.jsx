import React from "react";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

export default function ShipmentDetailsPage() {
  const TEXT_PRIMARY = "#071E54";      
  const TEXT_SECONDARY = "#4A4A4A";    
  const CARD_BG = "#FFFFFF";           
  const BG = "#EFF3F9";                

  const shipmentNo = "6300002994";

  const stops = [
    {
      id: "SP_1000",
      internalId: "SP_1000",
      type: "Planned Departure",
      date: "19/11/2025, 23:00:00 CET",
      load: "1.00000000000000 EA",
      unload: "0 Packages",
      address: "2nd street, 53121 Bonn North Rhine-Westphalia Germany",
      iconColor: "#2E7D32",
      icon: <LocalShippingIcon sx={{ fontSize: 22, color: "#2E7D32" }} />,
    },
    {
      id: "BP_NAV",
      internalId: "1000000000",
      type: "Planned Arrival",
      date: "19/11/2025, 23:00:00 CET",
      load: "10 Packages",
      unload: "0 Packages",
      address: "41 Theodor-Litt-Straße, 53121 BONN Hamburg Germany",
      iconColor: "#1976D2",
      icon: <LocationOnIcon sx={{ fontSize: 22, color: "#1976D2" }} />,
    }
  ];

  return (
    <div style={{ backgroundColor: BG }} className="min-h-screen px-4 py-4">

      {/* PAGE TITLE */}
      <h2
        className="text-lg font-semibold mb-4"
        style={{ color: TEXT_PRIMARY }}
      >
        Shipment Details ({shipmentNo})
      </h2>

      {/* CARDS */}
      {stops.map((stop, index) => (
        <div
          key={index}
          className="rounded-2xl p-5 mb-5 border"
          style={{
            backgroundColor: CARD_BG,
            borderColor: "#DDE3EC",
            boxShadow: "0px 6px 20px rgba(0,0,0,0.06)",
          }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${stop.iconColor}20` }}
              >
                {stop.icon}
              </div>

              <p
                className="font-semibold ml-3"
                style={{ color: stop.iconColor }}
              >
                {stop.id} ({stop.internalId})
              </p>
            </div>

            <MoreHorizIcon sx={{ color: "#6B6C6E" }} />
          </div>

          {/* DETAILS */}
          <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>
            {stop.type} At:
          </p>
          <p className="mb-2" style={{ color: TEXT_SECONDARY }}>
            {stop.date}
          </p>

          <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>
            Material Load :
          </p>
          <p style={{ color: TEXT_SECONDARY }}>{stop.load}</p>

          <p className="font-semibold mt-2" style={{ color: TEXT_PRIMARY }}>
            Material Unload :
          </p>
          <p style={{ color: TEXT_SECONDARY }}>{stop.unload}</p>

          <p className="font-semibold mt-3" style={{ color: TEXT_PRIMARY }}>
            Address:
          </p>
          <p style={{ color: TEXT_SECONDARY }}>{stop.address}</p>
        </div>
      ))}
    </div>
  );
}

