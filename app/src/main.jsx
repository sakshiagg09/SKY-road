import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { initPkceRedirectListener } from "./lib/http";

// Initialize OAuth redirect handling for mobile (Authorization Code + PKCE)
initPkceRedirectListener();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
