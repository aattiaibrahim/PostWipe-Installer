import { create } from "zustand";

export const SPECIALS_CATEGORY_ID = "specials";

// Placeholder gate while hosting (NAS/Mega) is figured out. The password lives in a
// public repo, so this is a curtain, not a lock — real auth comes with the real hosting.
const SPECIALS_PASSWORD = "aVoid";

interface SpecialsState {
  unlocked: boolean;
  /** Transient: true for a moment right after a successful unlock, to play the burst glyph. */
  justUnlocked: boolean;
  tryUnlock: (password: string) => boolean;
  clearJustUnlocked: () => void;
}

// Deliberately not persisted — relocks every app launch.
export const useSpecialsStore = create<SpecialsState>((set) => ({
  unlocked: false,
  justUnlocked: false,
  tryUnlock: (password) => {
    const ok = password === SPECIALS_PASSWORD;
    if (ok) set({ unlocked: true, justUnlocked: true });
    return ok;
  },
  clearJustUnlocked: () => set({ justUnlocked: false }),
}));
