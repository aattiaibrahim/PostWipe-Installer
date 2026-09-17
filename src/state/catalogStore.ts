import { create } from "zustand";
import type { Catalog, Os, Vendor } from "../types/catalog";
import { listCategories, type SystemInfo } from "../lib/tauriCommands";
import { HOME_CATEGORY_ID } from "../lib/constants";

export type VendorFilter = "all" | Vendor;
export type DockView = "settings" | "account";

interface CatalogState {
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  /** Which OS the catalog shows. Starts as this computer's OS; Settings can switch it. */
  osFilter: Os;
  /** Starts as this PC's detected CPU vendor; Settings can switch it (or show all). */
  vendorFilter: VendorFilter;
  /** This computer, as detected on launch (null until known, and in the browser preview). */
  system: SystemInfo | null;
  setSystem: (info: SystemInfo) => void;
  searchQuery: string;
  selectedCategoryId: string | null;
  /** Which bottom-left dock panel is open, if any. Settings and Account share one panel slot,
   *  so only one can be open at a time. */
  dockView: DockView | null;
  /** Whether either dock panel is expanded — the category sidebar dims while it is. */
  settingsOpen: boolean;
  /** True while sidebar categories extend behind the fixed settings dock — the dock casts a
   *  drop shadow only then (measured by CategorySidebar, rendered by SidebarSettings). */
  dockShadow: boolean;
  /** "Select Multiple Apps" mode: while on, clicking anywhere on a row/card toggles its
   *  selection (instead of needing the little checkbox / opening the Specials detail). */
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  setOsFilter: (os: Os) => void;
  setVendorFilter: (vendor: VendorFilter) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (id: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setDockView: (view: DockView | null) => void;
  setDockShadow: (on: boolean) => void;
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  catalog: null,
  loading: true,
  error: null,
  osFilter: "windows",
  vendorFilter: "all",
  system: null,
  setSystem: (info) => set({ system: info }),
  searchQuery: "",
  selectedCategoryId: HOME_CATEGORY_ID,
  dockView: null,
  settingsOpen: false,
  dockShadow: false,
  selectMode: false,
  setSelectMode: (on) => set({ selectMode: on }),
  setSettingsOpen: (open) => set({ settingsOpen: open, dockView: open ? "settings" : null }),
  setDockView: (view) => set({ dockView: view, settingsOpen: view !== null }),
  setDockShadow: (on) => set({ dockShadow: on }),
  // Intel/AMD only means anything on Windows — leaving macOS clears any vendor filter so
  // a hidden filter can't silently trim the list while its toggle isn't rendered.
  setOsFilter: (os) => set(os === "windows" ? { osFilter: os } : { osFilter: os, vendorFilter: "all" }),
  setVendorFilter: (vendor) => set({ vendorFilter: vendor }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (id) => set({ selectedCategoryId: id }),
  load: async () => {
    set({ loading: true, error: null });
    try {
      const catalog = await listCategories();
      set({ catalog, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
}));

// Dev-only handle so detection-dependent UI (Settings ▸ Apps shown, Kickstart's "Detected")
// can be exercised in the browser preview, which has no native side. Never set in production.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__catalogStore = useCatalogStore;
}
