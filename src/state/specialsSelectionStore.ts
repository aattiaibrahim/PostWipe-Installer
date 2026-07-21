import { create } from "zustand";
import { useCatalogStore } from "./catalogStore";

/** Multi-select for the Specials gallery (parallel to the catalog's selectionStore, but keyed
 *  by R2 object key since vault items aren't catalog apps and download through the Worker). */
interface SpecialsSelectionState {
  selected: string[];
  toggle: (objectKey: string) => void;
  clear: () => void;
}

export const useSpecialsSelectionStore = create<SpecialsSelectionState>((set) => ({
  selected: [],
  toggle: (objectKey) =>
    set((state) => {
      const selected = state.selected.includes(objectKey)
        ? state.selected.filter((k) => k !== objectKey)
        : [...state.selected, objectKey];
      // Deselecting the last item ends "Select Multiple Apps" mode — same as Clear.
      if (selected.length === 0) useCatalogStore.getState().setSelectMode(false);
      return { selected };
    }),
  clear: () => {
    useCatalogStore.getState().setSelectMode(false);
    set({ selected: [] });
  },
}));
