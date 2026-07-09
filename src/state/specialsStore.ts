import { create } from "zustand";
import { SPECIALS_WORKER_URL } from "../lib/specialsConfig";

export const SPECIALS_CATEGORY_ID = "specials";

interface SpecialsState {
  unlocked: boolean;
  /** Transient: true for a moment right after a successful unlock, to play the burst glyph. */
  justUnlocked: boolean;
  /** The validated key, kept in memory for the session so downloads can authenticate. */
  sessionKey: string | null;
  /** Validates the key against the Worker; unlocks + stores it on success. */
  tryUnlock: (key: string) => Promise<boolean>;
  clearJustUnlocked: () => void;
}

// Not persisted — relocks every launch, and the key never touches disk.
export const useSpecialsStore = create<SpecialsState>((set) => ({
  unlocked: false,
  justUnlocked: false,
  sessionKey: null,
  tryUnlock: async (key) => {
    try {
      const res = await fetch(`${SPECIALS_WORKER_URL}/validate?key=${encodeURIComponent(key)}`);
      if (!res.ok) return false;
      set({ unlocked: true, justUnlocked: true, sessionKey: key });
      return true;
    } catch {
      // Network failure (offline, Worker down) — treat as a failed unlock.
      return false;
    }
  },
  clearJustUnlocked: () => set({ justUnlocked: false }),
}));
