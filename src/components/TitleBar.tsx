import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/tauriCommands";
import { SelectionBar } from "./SelectionBar";

const appWindow = isTauri ? getCurrentWindow() : null;

export function TitleBar() {
  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar__left" data-tauri-drag-region>
        <div className="title-bar__brand" data-tauri-drag-region>
          <span className="title-bar__dot" />
          <span className="title-bar__title">PostWipe Installer</span>
        </div>
        <SelectionBar />
      </div>
      <div className="title-bar__actions">
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
