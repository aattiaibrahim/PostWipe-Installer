import { create } from "zustand";
import { useCatalogStore } from "./catalogStore";

interface SelectionState {
  /** App ids the user has checked for batch download. */
  selected: string[];
  toggle: (appId: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selected: [],
  toggle: (appId) =>
    set((state) => {
      const selected = state.selected.includes(appId)
        ? state.selected.filter((id) => id !== appId)
        : [...state.selected, appId];
      // Deselecting the last item ends "Select Multiple Apps" mode — same as Clear.
      if (selected.length === 0) useCatalogStore.getState().setSelectMode(false);
      return { selected };
    }),
  clear: () => {
    useCatalogStore.getState().setSelectMode(false);
    set({ selected: [] });
  },
}));
