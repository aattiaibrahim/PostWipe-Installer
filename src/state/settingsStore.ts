import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoCheckUpdates: true,
      setAutoCheckUpdates: (on) => set({ autoCheckUpdates: on }),
    }),
    { name: "postwipe-settings" },
  ),
);
