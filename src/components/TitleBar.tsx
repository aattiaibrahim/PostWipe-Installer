import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/tauriCommands";
import { SettingsPanel } from "./SettingsPanel";

const appWindow = isTauri ? getCurrentWindow() : null;

export function TitleBar() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar__brand" data-tauri-drag-region>
        <span className="title-bar__dot" />
        <span className="title-bar__title">PostWipe Installer</span>
      </div>
      <div className="title-bar__actions">
        <div className="title-bar__settings-anchor">
          <button className="title-bar__settings-btn" onClick={() => setShowSettings((s) => !s)}>
            Settings
          </button>
          <AnimatePresence>
            {showSettings && (
              <motion.div
                className="title-bar__settings-dropdown"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              >
                <SettingsPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="title-bar__window-controls">
          <button className="title-bar__win-btn" aria-label="Minimize" onClick={() => appWindow?.minimize()}>
            <svg viewBox="0 0 10 10" width="10" height="10">
              <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button className="title-bar__win-btn" aria-label="Maximize" onClick={() => appWindow?.toggleMaximize()}>
            <svg viewBox="0 0 10 10" width="10" height="10">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
            </svg>
          </button>
          <button className="title-bar__win-btn title-bar__win-btn--close" aria-label="Close" onClick={() => appWindow?.close()}>
            <svg viewBox="0 0 10 10" width="10" height="10">
              <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
