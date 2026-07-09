import { create } from "zustand";

interface SelectionState {
  /** App ids the user has checked for batch download. */
  selected: string[];
  toggle: (appId: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selected: [],
  toggle: (appId) =>
    set((state) => ({
      selected: state.selected.includes(appId)
        ? state.selected.filter((id) => id !== appId)
        : [...state.selected, appId],
    })),
  clear: () => set({ selected: [] }),
}));
