import { useEffect } from "react";
import { detectSystem } from "../lib/tauriCommands";
import { osPlatform } from "../lib/platform";
import { useCatalogStore } from "../state/catalogStore";

/** Shows the apps for the computer the app is running on: its OS, and — on Windows — its CPU
 *  vendor, so Intel-only tuning tools don't show on an AMD PC and vice versa. Both can be
 *  overridden in Settings ▸ Apps shown (e.g. to prep downloads for another machine). */
export function useOsDetect() {
  useEffect(() => {
    const store = useCatalogStore.getState();
    if (osPlatform === "macos") store.setOsFilter("macos");
    else if (osPlatform === "windows") store.setOsFilter("windows");
    void detectSystem().then((info) => {
      if (!info) return;
      const { setSystem, setVendorFilter, osFilter } = useCatalogStore.getState();
      setSystem(info);
      if (osFilter === "windows" && (info.cpuVendor === "intel" || info.cpuVendor === "amd")) {
        setVendorFilter(info.cpuVendor);
      }
    });
  }, []);
}
