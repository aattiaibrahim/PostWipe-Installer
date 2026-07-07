import { create } from "zustand";
import type { Catalog, Os } from "../types/catalog";
import { listCategories } from "../lib/tauriCommands";

interface CatalogState {
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  osFilter: Os;
  searchQuery: string;
  setOsFilter: (os: Os) => void;
  setSearchQuery: (query: string) => void;
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  catalog: null,
  loading: true,
  error: null,
  osFilter: "windows",
  searchQuery: "",
  setOsFilter: (os) => set({ osFilter: os }),
  setSearchQuery: (query) => set({ searchQuery: query }),
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
