import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface HistoryEntry {
  appId: string;
  appName: string;
  destPath: string;
  completedAt: number;
}

interface DownloadHistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: HistoryEntry) => void;
  removeEntry: (destPath: string) => void;
  clear: () => void;
}

export const useDownloadHistoryStore = create<DownloadHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries.filter((e) => e.destPath !== entry.destPath)].slice(0, 100),
        })),
      removeEntry: (destPath) =>
        set((state) => ({ entries: state.entries.filter((e) => e.destPath !== destPath) })),
      clear: () => set({ entries: [] }),
    }),
    { name: "postwipe-download-history" },
  ),
);
