import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/tauriCommands";
import { osPlatform } from "../lib/platform";

/** Marks <html> for frameless-window styling: `.tauri` plus a `platform-*` class enable the
 *  rounded-corner clip on Windows/Linux (where the window is transparent + undecorated, see
 *  tauri.conf.json — macOS keeps native decorations and corners), and `.window-maximized`
 *  drops the rounding while the window fills the screen. */
export function useWindowChrome() {
  useEffect(() => {
    if (!isTauri) return;
    const root = document.documentElement;
    root.classList.add("tauri", `platform-${osPlatform}`);
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const sync = async () => {
      const filled = (await win.isMaximized()) || (await win.isFullscreen());
      if (!disposed) root.classList.toggle("window-maximized", filled);
    };
    sync();
    win.onResized(() => void sync()).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });

    // The traffic lights grey out while another window has focus, as on macOS.
    const onBlur = () => root.classList.add("window-blurred");
    const onFocus = () => root.classList.remove("window-blurred");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      root.classList.remove("tauri", `platform-${osPlatform}`, "window-maximized", "window-blurred");
    };
  }, []);
}
