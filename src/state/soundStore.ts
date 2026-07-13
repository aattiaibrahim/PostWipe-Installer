import { create } from "zustand";
import { persist } from "zustand/middleware";

/** UI click sounds (the Ubuntu "Menu popup" chime). On by default; toggled in Settings. */
interface SoundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: "postwipe-sound" },
  ),
);
