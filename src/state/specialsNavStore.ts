import { create } from "zustand";

/** Where you are inside Specials: which category is open, and the folders drilled into
 *  below it. `folder: null` is the landing grid of category covers.
 *
 *  This used to be `useState` inside SpecialsContent. It lives in a store so back/forward
 *  history (navHistoryStore) can put you back in the folder you came from - component state
 *  is out of its reach, and vanished whenever the page unmounted. */
interface SpecialsNavState {
  folder: string | null;
  path: string[];
  /** Open a category from the landing grid. */
  openFolder: (folder: string) => void;
  /** Drill into a subfolder of the current node. */
  enter: (name: string) => void;
  /** One level up: out of a subfolder, or from a category back to the landing grid. */
  up: () => void;
  /** Jump straight to a location (history restoring one). */
  setAt: (folder: string | null, path: string[]) => void;
}

export const useSpecialsNavStore = create<SpecialsNavState>((set, get) => ({
  folder: null,
  path: [],
  openFolder: (folder) => set({ folder, path: [] }),
  enter: (name) => set({ path: [...get().path, name] }),
  up: () => {
    const { path } = get();
    set(path.length > 0 ? { path: path.slice(0, -1) } : { folder: null, path: [] });
  },
  setAt: (folder, path) => set({ folder, path }),
}));
