import { invoke } from "@tauri-apps/api/core";
import type { Catalog } from "../types/catalog";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function listCategories(): Promise<Catalog> {
  if (isTauri) return invoke("list_categories");
  // Plain-browser dev preview fallback (no Tauri IPC available) — reads the copy in
  // public/catalog.json, which is not the source of truth; the app always uses the
  // Rust-embedded catalog/catalog.json at runtime.
  const res = await fetch("/catalog.json");
  return res.json();
}
