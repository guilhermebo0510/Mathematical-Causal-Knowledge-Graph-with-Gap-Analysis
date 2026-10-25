import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./style.css";
import "./themes.css";
import { applyAppearance, readPreferences } from "./preferences";

// Read appearance before the first mount, including the loading splash.
applyAppearance(readPreferences());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
