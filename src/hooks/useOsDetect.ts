import { useEffect } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useCatalogStore } from "../state/catalogStore";

export function useOsDetect() {
  const setOsFilter = useCatalogStore((s) => s.setOsFilter);

  useEffect(() => {
    try {
      const p = platform();
      if (p === "macos") setOsFilter("macos");
      else if (p === "windows") setOsFilter("windows");
    } catch {
      // Not running under Tauri (e.g. plain browser preview) — keep the default.
    }
  }, [setOsFilter]);
}
