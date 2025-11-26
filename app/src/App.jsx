import React from "react";
import ShipmentSearchPage from "./pages/ShipmentSearchPage";

export default function App() {
  return (
    <div className="min-h-screen bg-[#050816] text-slate-50 flex">
      <div className="flex-1 max-w-md mx-auto w-full px-4 pt-6 pb-4">
        <ShipmentSearchPage />
      </div>
    </div>
  );
}
