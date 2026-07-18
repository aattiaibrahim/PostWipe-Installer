import { platform } from "@tauri-apps/plugin-os";
import { isTauri } from "./tauriCommands";

/** "macos" | "windows" | "linux" | … inside Tauri, "web" in a plain browser. */
export const osPlatform: string = isTauri ? platform() : "web";

/** macOS keeps native decorations with overlay traffic lights (see tauri.macos.conf.json),
 *  so the custom window controls and CSS corner rounding only apply elsewhere. */
export const isMacOS = osPlatform === "macos";
