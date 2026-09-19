import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/tauriCommands";
import { isMacOS, osPlatform } from "../lib/platform";
import { LogoMark } from "./LogoMark";

const appWindow = isTauri ? getCurrentWindow() : null;

// macOS shows the native traffic lights (titleBarStyle Overlay) — native minimize/zoom
// animations included — so the custom ones only render elsewhere.
const showCustomControls = !isMacOS;
// Windows users reach for the top-right corner, so the lights live there on Windows, in
// Windows order (minimize, maximize, close outermost). Other platforms keep the Mac corner.
const controlsOnRight = osPlatform === "windows" || osPlatform === "web";

/* Golden Gate window animations. The window is transparent (it's how the rounded corners
   work), so animating the whole app shell really does shrink and fade the window, as macOS
   does, before the OS takes over. Each class drives a keyframe in golden-gate.css. */
const ANIM_MS = { closing: 190, minimizing: 230, zooming: 280, restoring: 280 } as const;
type WindowAnim = keyof typeof ANIM_MS;
let minimizedByUs = false;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function play(anim: WindowAnim): Promise<void> {
  const root = document.documentElement;
  if (reducedMotion()) return Promise.resolve();
  for (const a of Object.keys(ANIM_MS)) root.classList.remove(`window-${a}`);
  // Force a reflow so replaying the same class restarts its keyframe.
  void root.offsetWidth;
  root.classList.add(`window-${anim}`);
  return new Promise((resolve) => window.setTimeout(resolve, ANIM_MS[anim]));
}

function clear(anim: WindowAnim) {
  document.documentElement.classList.remove(`window-${anim}`);
}

async function closeWindow() {
  await play("closing");
  await appWindow?.close();
  // Still here (browser preview, or the close was refused): put the window back.
  window.setTimeout(() => clear("closing"), 400);
}

async function minimizeWindow() {
  await play("minimizing");
  minimizedByUs = true;
  await appWindow?.minimize();
  // Undo the shrink once the OS has hidden the window, so it comes back whole.
  window.setTimeout(() => clear("minimizing"), appWindow ? 120 : 400);
}

async function zoomWindow() {
  await appWindow?.toggleMaximize();
  await play("zooming");
  clear("zooming");
}

const CLOSE = (
  <button key="close" className="traffic-light traffic-light--close" aria-label="Close" onClick={() => void closeWindow()}>
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
    </svg>
  </button>
);
const MINIMIZE = (
  <button key="minimize" className="traffic-light traffic-light--minimize" aria-label="Minimize" onClick={() => void minimizeWindow()}>
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 6h6" />
    </svg>
  </button>
);
const ZOOM = (
  <button key="zoom" className="traffic-light traffic-light--zoom" aria-label="Maximize" onClick={() => void zoomWindow()}>
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.6 8.4V4.9l3.5 3.5zM8.4 3.6v3.5L4.9 3.6z" className="traffic-light__fill" />
    </svg>
  </button>
);

/** macOS Golden Gate window controls: red/yellow/green lights whose symbols appear only while
 *  the pointer is over the group, so the chrome stays quiet the rest of the time. */
function TrafficLights({ right }: { right: boolean }) {
  return (
    <div className={`traffic-lights${right ? " traffic-lights--right" : ""}`} role="group" aria-label="Window controls">
      {right ? [MINIMIZE, ZOOM, CLOSE] : [CLOSE, MINIMIZE, ZOOM]}
    </div>
  );
}

export function TitleBar() {
  // Coming back from our minimize: the window grows back into place instead of popping in.
  useEffect(() => {
    if (!appWindow || !showCustomControls) return;
    const off = appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused || !minimizedByUs) return;
      minimizedByUs = false;
      void play("restoring").then(() => clear("restoring"));
    });
    return () => void off.then((f) => f());
  }, []);

  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar__brand" data-tauri-drag-region>
        {showCustomControls && !controlsOnRight && <TrafficLights right={false} />}
        <LogoMark className="title-bar__logo" />
        <span className="title-bar__title">PostWipe Installer</span>
      </div>
      {showCustomControls && controlsOnRight && <TrafficLights right />}
    </div>
  );
}
