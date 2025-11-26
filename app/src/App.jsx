import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import ShipmentSearchPage from "./pages/ShipmentSearchPage";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex bg-[#050816] text-slate-50">
        <div className="flex-1 max-w-md mx-auto w-full">
          <Routes>
            {/* Home / Search Page */}
            <Route path="/" element={<ShipmentSearchPage />} />

            {/* Shipment Details Page */}
            <Route path="/ShipmentDetails" element={<ShipmentDetailsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
