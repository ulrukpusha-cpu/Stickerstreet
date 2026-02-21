import React from "react";
import ReactDOM from "react-dom/client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import App from "./App";
import "./styles.css";
import { Analytics } from "@vercel/analytics/react";

const manifestUrl =
  (import.meta.env.VITE_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")) +
  "/tonconnect-manifest.json";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
      <Analytics />
    </TonConnectUIProvider>
  </React.StrictMode>
);
