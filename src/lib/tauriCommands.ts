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

export function generateScript(scriptId: string): Promise<string> {
  return invoke("generate_script", { scriptId });
}
