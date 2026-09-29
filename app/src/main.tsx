import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ThemeProvider, applyInitialTheme } from "@/lib/theme";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { DataProvider } from "@/lib/data";
import "./index.css";

// Set light or dark before the first paint, so dark mode never flashes light at start-up.
applyInitialTheme();

// Hash routing: the app is served from local files, so every screen must load without a server.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delay={400}>
        <DataProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </DataProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
