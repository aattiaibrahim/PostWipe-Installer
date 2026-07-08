import { create } from "zustand";
import type { Catalog, Os } from "../types/catalog";
import { listCategories } from "../lib/tauriCommands";
import { ALL_CATEGORY_ID } from "../lib/constants";

interface CatalogState {
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  osFilter: Os;
  searchQuery: string;
  selectedCategoryId: string | null;
  setOsFilter: (os: Os) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (id: string) => void;
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  catalog: null,
  loading: true,
  error: null,
  osFilter: "windows",
  searchQuery: "",
  selectedCategoryId: ALL_CATEGORY_ID,
  setOsFilter: (os) => set({ osFilter: os }),
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
