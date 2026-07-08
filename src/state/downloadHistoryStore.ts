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
      clear: () => set({ entries: [] }),
    }),
    { name: "postwipe-download-history" },
  ),
);
