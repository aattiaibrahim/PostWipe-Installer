/** What a PostWipe account stores beyond its login: favourite apps, named sets of apps, and
 *  synced app settings. One JSON document per user, replaced whole on each save.
 *
 *  Everything here arrives from a client and is validated field by field — the app is the
 *  intended caller, but the endpoint is public and sign-ups are open, so it must hold up
 *  against anything someone curls at it. */

export interface AppSet {
  id: string;
  name: string;
  apps: { windows: string[]; macos: string[] };
}

export interface SyncedSettings {
  theme?: string;
  backdrop?: "wallpaper" | "native";
  soundEnabled?: boolean;
  autoCheckUpdates?: boolean;
}

export interface Profile {
  favorites: string[];
  sets: AppSet[];
  settings: SyncedSettings;
  /** Unix milliseconds of the last successful save; 0 for a brand-new account. */
  updatedAt: number;
}

export const EMPTY_PROFILE: Profile = { favorites: [], sets: [], settings: {}, updatedAt: 0 };

// Generous for a catalog of ~120 apps, tight enough that nobody uses this as free storage.
const MAX_APP_IDS = 500;
const MAX_SETS = 50;
export const MAX_BODY_BYTES = 64 * 1024;

const APP_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const THEME_ID = /^[a-z0-9-]{1,32}$/;

class ValidationError extends Error {}

function appIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list`);
  if (value.length > MAX_APP_IDS) throw new ValidationError(`${field} has more than ${MAX_APP_IDS} apps`);
  const ids = value.map((v) => {
    if (typeof v !== "string" || !APP_ID.test(v)) throw new ValidationError(`${field} contains an invalid app id`);
    return v;
  });
  return [...new Set(ids)];
}

function sets(value: unknown): AppSet[] {
  if (!Array.isArray(value)) throw new ValidationError("sets must be a list");
  if (value.length > MAX_SETS) throw new ValidationError(`no more than ${MAX_SETS} sets`);
  const seen = new Set<string>();
  return value.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new ValidationError(`set ${i + 1} is malformed`);
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(s.id)) {
      throw new ValidationError(`set ${i + 1} has an invalid id`);
    }
    if (seen.has(s.id)) throw new ValidationError(`set id "${s.id}" is used twice`);
    seen.add(s.id);
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (name.length < 1 || name.length > 60) throw new ValidationError(`set ${i + 1} needs a name of 1–60 characters`);
    const apps = (s.apps ?? {}) as Record<string, unknown>;
    return {
      id: s.id,
      name,
      apps: { windows: appIds(apps.windows ?? [], "set apps"), macos: appIds(apps.macos ?? [], "set apps") },
    };
  });
}

function settings(value: unknown): SyncedSettings {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("settings must be an object");
  const s = value as Record<string, unknown>;
  const out: SyncedSettings = {};
  // Unknown keys are dropped rather than stored, so the document can't grow arbitrary junk.
  if (s.theme !== undefined) {
    if (typeof s.theme !== "string" || !THEME_ID.test(s.theme)) throw new ValidationError("invalid theme");
    out.theme = s.theme;
  }
  if (s.backdrop !== undefined) {
    if (s.backdrop !== "wallpaper" && s.backdrop !== "native") throw new ValidationError("invalid backdrop");
    out.backdrop = s.backdrop;
  }
  for (const key of ["soundEnabled", "autoCheckUpdates"] as const) {
    if (s[key] !== undefined) {
      if (typeof s[key] !== "boolean") throw new ValidationError(`${key} must be true or false`);
      out[key] = s[key] as boolean;
    }
  }
  return out;
}

/** Returns the cleaned profile, or an error message suitable to show the user. */
export function parseProfileInput(body: unknown): { ok: true; value: Omit<Profile, "updatedAt"> } | { ok: false; error: string } {
  try {
    if (!body || typeof body !== "object") throw new ValidationError("expected a JSON object");
    const b = body as Record<string, unknown>;
    return {
      ok: true,
      value: {
        favorites: appIds(b.favorites ?? [], "favorites"),
        sets: sets(b.sets ?? []),
        settings: settings(b.settings),
      },
    };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}
