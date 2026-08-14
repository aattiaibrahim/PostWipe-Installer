import { create } from "zustand";
import { SPECIALS_WORKER_URL } from "../lib/specialsConfig";
import { clearVaultKey, getVaultKey, saveVaultKey } from "../lib/tauriCommands";

export const SPECIALS_CATEGORY_ID = "specials";

interface SpecialsState {
  unlocked: boolean;
  /** Transient: true for a moment right after a successful unlock, to play the burst glyph. */
  justUnlocked: boolean;
  /** The validated key, used so downloads can authenticate. */
  sessionKey: string | null;
  /** Validates the key against the Worker; unlocks + remembers it on success. */
  tryUnlock: (key: string) => Promise<boolean>;
  /** The padlock in Settings: forget the key and lock the vault again. */
  lock: () => void;
  clearJustUnlocked: () => void;
}

// Starts LOCKED. A successful unlock is remembered on disk (settings.rs) so it survives
// relaunches; the padlock in Settings forgets it, and an app update invalidates it (the
// stored key is stamped with the app version). Trade-off of remembering: anyone at this
// PC gets the vault without the password until it's locked again.
export const useSpecialsStore = create<SpecialsState>((set) => ({
  unlocked: false,
  justUnlocked: false,
  sessionKey: null,
  tryUnlock: async (key) => {
    try {
      const res = await fetch(`${SPECIALS_WORKER_URL}/validate?key=${encodeURIComponent(key)}`);
      if (!res.ok) return false;
      set({ unlocked: true, justUnlocked: true, sessionKey: key });
      void saveVaultKey(key);
      return true;
    } catch {
      // Network failure (offline, Worker down) — treat as a failed unlock.
      return false;
    }
  },
  lock: () => {
    void clearVaultKey();
    set({ unlocked: false, justUnlocked: false, sessionKey: null });
  },
  clearJustUnlocked: () => set({ justUnlocked: false }),
}));

/** On launch, restore a remembered unlock. Re-validates against the Worker rather than
 *  trusting the file, so a rotated/revoked key locks the vault instead of half-opening it
 *  (every request would 401 and the gallery would just look broken). */
export async function hydrateVaultUnlock(): Promise<void> {
  const key = await getVaultKey();
  if (!key) return;
  try {
    const res = await fetch(`${SPECIALS_WORKER_URL}/validate?key=${encodeURIComponent(key)}`);
    if (!res.ok) {
      void clearVaultKey();
      return;
    }
    // No justUnlocked — the burst animation belongs to a real unlock, not a restore.
    useSpecialsStore.setState({ unlocked: true, sessionKey: key });
  } catch {
    /* offline: stay locked, the key is still on disk for the next launch */
  }
}

// Dev-only escape hatch, pairing with __specialsContent (see specialsContentStore): lets
// the browser preview open the gated UI without the real key. Never set in production.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__specialsGate = useSpecialsStore;
}
