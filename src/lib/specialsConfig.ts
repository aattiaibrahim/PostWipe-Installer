// The Specials vault gate (Cloudflare Worker in front of a private R2 bucket).
// See specials-gate/ for the Worker itself. The key is never stored here — the user
// types it into the unlock prompt; the app validates it against the Worker and holds
// it in memory for the session only.
export const SPECIALS_WORKER_URL = "https://postwipe-specials-gate.andrewattiaibrahim.workers.dev";

/** R2 stores everything under `Tweaks/<folder>/`. This maps each folder to how the UI
 *  presents it and how downloaded items install. Folders not listed here still appear
 *  under their raw name with download-only behavior. */
export interface SpecialsCategoryMeta {
  label: string;
  order: number;
  install: "cursor" | "font" | "sound" | "none";
  blurb?: string;
}

export const SPECIALS_CATEGORIES: Record<string, SpecialsCategoryMeta> = {
  Cursors: { label: "Cursor Packs", order: 1, install: "cursor", blurb: "Download, then Install to apply the cursor scheme (install.inf)." },
  Fonts: { label: "Fonts", order: 2, install: "font", blurb: "Download, then Install to add the font(s) to Windows." },
  "Windows Sounds": { label: "Windows Sounds", order: 3, install: "sound", blurb: "Preview and install custom system sound sets." },
  "Audio & EQ Profiles": { label: "Audio & EQ", order: 4, install: "none", blurb: "Peace/EqualizerAPO EQ profiles — download and import in Peace." },
  "Steam Profiles": { label: "Steam Profiles", order: 5, install: "none", blurb: "Artwork/showcase packs — download the archive and apply in Steam." },
  "PSD's": { label: "PSDs", order: 6, install: "none", blurb: "Photoshop layer-style packs — download only." },
  "Windows Themes": { label: "Windows Themes (deprecated)", order: 7, install: "none", blurb: "Only worked on Windows 10; kept for the archive." },
};

export function categoryMeta(folder: string): SpecialsCategoryMeta {
  return SPECIALS_CATEGORIES[folder] ?? { label: folder, order: 99, install: "none" };
}
