import { create } from "zustand";
import type { Os } from "../types/catalog";
import { isTauri } from "../lib/tauriCommands";
import * as api from "../lib/accountCommands";
import type { AccountUser, AppSet, Profile, SyncedSettings } from "../lib/accountCommands";
import { THEMES, useThemeStore, type Theme } from "./themeStore";
import { useBackdropStore } from "./backdropStore";
import { useSoundStore } from "./soundStore";
import { useSettingsStore } from "./settingsStore";

const EMPTY: Profile = { favorites: [], sets: [], settings: {}, updatedAt: 0 };
const SAVE_DEBOUNCE_MS = 700;

type SyncState = "idle" | "saving" | "error";

interface AccountState {
  /** Accounts need the native HTTP client; the browser preview can't sign in. */
  available: boolean;
  checked: boolean;
  user: AccountUser | null;
  /** What this device currently holds, including edits not yet saved. */
  profile: Profile;
  /** The last copy the server confirmed — the merge base when another device saved first. */
  synced: Profile;
  sync: SyncState;
  syncError: string | null;

  init: () => Promise<void>;
  /** Called after any successful sign-in or sign-up. */
  onSignedIn: (user: AccountUser | null) => Promise<void>;
  setUser: (user: AccountUser | null) => void;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;

  toggleFavorite: (appId: string) => void;
  saveSet: (name: string, apps: Record<Os, string[]>) => void;
  deleteSet: (id: string) => void;
}

// Set while server settings are being written INTO the local stores, so those writes don't
// bounce straight back out as "the user changed a setting" and trigger a save.
let applyingRemote = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function localSettings(): SyncedSettings {
  return {
    theme: useThemeStore.getState().theme,
    backdrop: useBackdropStore.getState().backdrop,
    soundEnabled: useSoundStore.getState().enabled,
    autoCheckUpdates: useSettingsStore.getState().autoCheckUpdates,
  };
}

function applySettings(settings: SyncedSettings) {
  applyingRemote = true;
  try {
    if (settings.theme && THEMES.some((t) => t.id === settings.theme)) {
      useThemeStore.getState().setTheme(settings.theme as Theme);
    }
    if (settings.backdrop) useBackdropStore.getState().setBackdrop(settings.backdrop);
    if (typeof settings.soundEnabled === "boolean") useSoundStore.getState().setEnabled(settings.soundEnabled);
    if (typeof settings.autoCheckUpdates === "boolean") {
      useSettingsStore.getState().setAutoCheckUpdates(settings.autoCheckUpdates);
    }
  } finally {
    applyingRemote = false;
  }
}

/** Three-way merge used when another device saved between our load and our save.
 *
 *  Plain "last write wins" would silently undo whatever the other PC did — the realistic case
 *  being two machines set up on the same weekend. Using the last-synced copy as the base,
 *  each side's actual CHANGES are kept: a favourite added here and one removed there both
 *  survive. */
export function mergeProfiles(base: Profile, mine: Profile, theirs: Profile): Profile {
  const added = mine.favorites.filter((id) => !base.favorites.includes(id));
  const removed = new Set(base.favorites.filter((id) => !mine.favorites.includes(id)));
  const favorites = [...new Set([...theirs.favorites, ...added])].filter((id) => !removed.has(id));

  const baseSets = new Map(base.sets.map((s) => [s.id, s]));
  const sets = new Map(theirs.sets.map((s) => [s.id, s]));
  for (const set of mine.sets) {
    const before = baseSets.get(set.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(set)) sets.set(set.id, set);
  }
  for (const id of baseSets.keys()) {
    if (!mine.sets.some((s) => s.id === id)) sets.delete(id);
  }

  const settings: SyncedSettings = { ...theirs.settings };
  for (const key of Object.keys(mine.settings) as (keyof SyncedSettings)[]) {
    if (mine.settings[key] !== base.settings[key]) Object.assign(settings, { [key]: mine.settings[key] });
  }

  return { favorites, sets: [...sets.values()], settings, updatedAt: theirs.updatedAt };
}

export const useAccountStore = create<AccountState>((set, get) => {
  async function flush(retried = false): Promise<void> {
    const { user, profile } = get();
    if (!user) return;
    set({ sync: "saving", syncError: null });
    try {
      const result = await api.saveProfile(profile);
      if (result.outcome === "saved") {
        // Keep edits made WHILE this save was in flight; only adopt the server's version stamp.
        set((s) => ({ synced: result.profile, profile: { ...s.profile, updatedAt: result.profile.updatedAt }, sync: "idle" }));
      } else if (!retried) {
        const merged = mergeProfiles(get().synced, get().profile, result.profile);
        applySettings(merged.settings);
        set({ profile: merged, synced: result.profile });
        await flush(true);
      } else {
        set({ sync: "error", syncError: "Couldn't sync — another device keeps changing this account." });
      }
    } catch (err) {
      set({ sync: "error", syncError: api.errorMessage(err) });
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }

  function update(mutate: (p: Profile) => Profile) {
    if (!get().user) return;
    set((s) => ({ profile: mutate(s.profile) }));
    scheduleSave();
  }

  // Settings changed anywhere in the app → sync them, unless we're the ones applying them.
  const onSettingChanged = () => {
    if (applyingRemote || !get().user) return;
    update((p) => ({ ...p, settings: localSettings() }));
  };
  useThemeStore.subscribe(onSettingChanged);
  useBackdropStore.subscribe(onSettingChanged);
  useSoundStore.subscribe(onSettingChanged);
  useSettingsStore.subscribe(onSettingChanged);

  return {
    available: isTauri,
    checked: !isTauri,
    user: null,
    profile: EMPTY,
    synced: EMPTY,
    sync: "idle",
    syncError: null,

    init: async () => {
      if (!isTauri) return;
      try {
        const user = await api.accountStatus();
        set({ checked: true });
        if (user) await get().onSignedIn(user);
      } catch {
        // Offline at launch: stay signed-out in the UI; the saved session is kept on disk and
        // the next launch (or next sign-in attempt) picks it back up.
        set({ checked: true });
      }
    },

    onSignedIn: async (user) => {
      const current = user ?? (await api.accountStatus());
      set({ user: current });
      if (!current) return;
      try {
        const remote = await api.getProfile();
        if (remote.updatedAt === 0) {
          // Brand-new account: this device's current setup becomes the account's starting point.
          set({ profile: { ...EMPTY, settings: localSettings() }, synced: remote });
          await flush();
        } else {
          applySettings(remote.settings);
          set({ profile: remote, synced: remote, sync: "idle", syncError: null });
        }
      } catch (err) {
        set({ sync: "error", syncError: api.errorMessage(err) });
      }
    },

    setUser: (user) => set({ user }),

    signOut: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await flush();
      }
      await api.signOut();
      set({ user: null, profile: EMPTY, synced: EMPTY, sync: "idle", syncError: null });
    },

    deleteAccount: async (password) => {
      await api.deleteAccount(password);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      set({ user: null, profile: EMPTY, synced: EMPTY, sync: "idle", syncError: null });
    },

    toggleFavorite: (appId) =>
      update((p) => ({
        ...p,
        favorites: p.favorites.includes(appId) ? p.favorites.filter((id) => id !== appId) : [...p.favorites, appId],
      })),

    saveSet: (name, apps) =>
      update((p) => {
        const existing = p.sets.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
        const next: AppSet = {
          id: existing?.id ?? `set-${Date.now().toString(36)}`,
          name: name.trim(),
          apps,
        };
        // Saving under an existing name replaces that set rather than creating a duplicate.
        return { ...p, sets: existing ? p.sets.map((s) => (s.id === existing.id ? next : s)) : [...p.sets, next] };
      }),

    deleteSet: (id) => update((p) => ({ ...p, sets: p.sets.filter((s) => s.id !== id) })),
  };
});
