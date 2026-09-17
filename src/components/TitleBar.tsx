import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/tauriCommands";
import { isMacOS } from "../lib/platform";
import { LogoMark } from "./LogoMark";

const appWindow = isTauri ? getCurrentWindow() : null;

// macOS shows the native traffic lights (titleBarStyle Overlay) — native minimize/zoom
// animations included — so the custom ones only render elsewhere.
const showCustomControls = !isMacOS;

/** macOS Golden Gate window controls on every OS: close, minimize, zoom as red/yellow/green
 *  lights at the top-left. Their symbols appear only while the pointer is over the group, the
 *  way macOS does it, so the chrome stays quiet the rest of the time. */
function TrafficLights() {
  return (
    <div className="traffic-lights" role="group" aria-label="Window controls">
      <button className="traffic-light traffic-light--close" aria-label="Close" onClick={() => appWindow?.close()}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
        </svg>
      </button>
      <button className="traffic-light traffic-light--minimize" aria-label="Minimize" onClick={() => appWindow?.minimize()}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 6h6" />
        </svg>
      </button>
      <button className="traffic-light traffic-light--zoom" aria-label="Maximize" onClick={() => appWindow?.toggleMaximize()}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.6 8.4V4.9l3.5 3.5zM8.4 3.6v3.5L4.9 3.6z" className="traffic-light__fill" />
        </svg>
      </button>
    </div>
  );
}

export function TitleBar() {
  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar__brand" data-tauri-drag-region>
        {showCustomControls && <TrafficLights />}
        <LogoMark className="title-bar__logo" />
        <span className="title-bar__title">PostWipe Installer</span>
      </div>
    </div>
  );
}
