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

/** Deletes a downloaded file. The backend refuses anything outside PostWipeDownloads. */
export function deleteDownload(path: string): Promise<void> {
  return invoke("delete_download", { path });
}

export function startSpecialsDownload(
  itemId: string,
  name: string,
  url: string,
  filename: string,
): Promise<{ jobId: string; destPath: string }> {
  return invoke("start_specials_download", { itemId, name, url, filename });
}

export function installSpecialsItem(archivePath: string, installType: string): Promise<string> {
  return invoke("install_specials_item", { archivePath, installType });
}

export interface CursorVariant {
  label: string;
  inf_path: string;
}

/** Extracts a cursor pack and lists every install.inf scheme inside it (for the variant picker). */
export function listCursorVariants(archivePath: string): Promise<CursorVariant[]> {
  return invoke("list_cursor_variants", { archivePath });
}

export function applyCursorVariant(infPath: string): Promise<string> {
  return invoke("apply_cursor_variant", { infPath });
}

export async function specialsItemInstalled(filename: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke("specials_item_installed", { filename });
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

/** Resolves with the full path of the created Start-menu .lnk. */
export function pinScriptToStartMenu(scriptId: string, scriptPath: string): Promise<string> {
  return invoke("pin_script_to_start_menu", { scriptId, scriptPath });
}

export function unpinScriptFromStartMenu(scriptId: string): Promise<void> {
  return invoke("unpin_script_from_start_menu", { scriptId });
}

/** Disk-backed theme persistence (see settings.rs) — durable across restarts even
 *  when the WebView drops localStorage. No-ops outside Tauri (browser dev). */
export async function getSavedTheme(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("get_theme");
}

export async function saveTheme(theme: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("set_theme", { theme });
  } catch {
    /* best-effort; localStorage still holds it for the session */
  }
}

export type Backdrop = "wallpaper" | "native";

/** Disk-backed backdrop choice (see settings.rs), for the same durability reason as theme. */
export async function getSavedBackdrop(): Promise<Backdrop | null> {
  if (!isTauri) return null;
  try {
    return await invoke<Backdrop | null>("get_backdrop");
  } catch {
    return null;
  }
}

export async function saveBackdrop(backdrop: Backdrop): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("set_backdrop", { backdrop });
  } catch {
    /* best-effort */
  }
}

/** Remembered Specials key (see settings.rs). Returns null when the vault should be
 *  locked: never unlocked, explicitly locked, or the app was updated since. */
export async function getVaultKey(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string | null>("get_vault_key");
  } catch {
    return null;
  }
}

export async function saveVaultKey(key: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("set_vault_key", { key });
  } catch {
    /* best-effort — the vault just relocks next launch */
  }
}

/** Health of one catalog download — see `src-tauri/src/health/mod.rs` for the rules.
 *  `unknown` explicitly means "couldn't verify", NOT "broken": bot-blocks and dead
 *  connections land here so a flaky CI network can never grey out a working download. */
export type HealthStatus = "ok" | "unknown" | "broken";

export interface EntryHealth {
  app_id: string;
  os: Os;
  status: HealthStatus;
  detail: string;
}

export interface HealthReport {
  /** Unix seconds. */
  generated_at: number;
  /** "ci" = the weekly published sweep, "local" = a check the user ran themselves. */
  source: string;
  entries: EntryHealth[];
}

/** Badges for launch: the published weekly sweep (one request), a local check if the user
 *  has run one, or null when nothing trustworthy exists — in which case show no badges. */
export async function loadCatalogHealth(): Promise<HealthReport | null> {
  if (!isTauri) {
    // Browser dev preview has no IPC — read the copy in public/, mirroring the
    // catalog.json fallback above. The real app always goes through the Rust command,
    // which also handles caching and the local-check override.
    try {
      const res = await fetch("/health.json");
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }
  try {
    return await invoke<HealthReport | null>("load_catalog_health");
  } catch {
    return null;
  }
}

/** Really resolves and fetches every download for `os`. Streams `health-check:*` events. */
export function runHealthCheck(os: Os): Promise<HealthReport> {
  return invoke("run_health_check", { os });
}

export async function clearLocalHealth(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("clear_local_health");
  } catch {
    /* best-effort */
  }
}

export async function clearVaultKey(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("clear_vault_key");
  } catch {
    /* best-effort */
  }
}
