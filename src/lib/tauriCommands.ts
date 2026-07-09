import { invoke } from "@tauri-apps/api/core";
import type { Catalog, Os } from "../types/catalog";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function listCategories(): Promise<Catalog> {
  if (isTauri) return invoke("list_categories");
  // Plain-browser dev preview fallback (no Tauri IPC available) — reads the copy in
  // public/catalog.json, which is not the source of truth; the app always uses the
  // Rust-embedded catalog/catalog.json at runtime.
  const res = await fetch("/catalog.json");
  return res.json();
}

export function startDownload(appId: string, os: Os): Promise<string> {
  return invoke("start_download", { appId, os });
}

export function cancelDownload(jobId: string): Promise<boolean> {
  return invoke("cancel_download", { jobId });
}

export function listActiveDownloads(): Promise<{ jobId: string; appId: string; appName: string }[]> {
  return invoke("list_active_downloads");
}

export function openDownloadsFolder(): Promise<void> {
  return invoke("open_downloads_folder");
}

export async function pathsExist(paths: string[]): Promise<boolean[]> {
  // Browser preview has no filesystem access — treat everything as present.
  if (!isTauri) return paths.map(() => true);
  return invoke("paths_exist", { paths });
}

export function generateScript(scriptId: string): Promise<string> {
  return invoke("generate_script", { scriptId });
}

export function findGeneratedScript(scriptId: string): Promise<string | null> {
  return invoke("find_generated_script", { scriptId });
}

export function isScriptPinned(scriptId: string): Promise<boolean> {
  return invoke("is_script_pinned", { scriptId });
}

export function pinScriptToStartMenu(scriptId: string, scriptPath: string): Promise<void> {
  return invoke("pin_script_to_start_menu", { scriptId, scriptPath });
}

export function unpinScriptFromStartMenu(scriptId: string): Promise<void> {
  return invoke("unpin_script_from_start_menu", { scriptId });
}
