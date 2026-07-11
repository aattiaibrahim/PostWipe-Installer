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
  "Payday 2 Mods - Diesel 2.0": {
    label: "PayDay 2 Mods (Diesel 2.0)",
    order: 6,
    install: "none",
    blurb: "Mods for PAYDAY 2's Diesel 2.0 engine — extract into your PAYDAY 2 install folder (steamapps\\common\\PAYDAY 2).",
  },
  "PSD's": { label: "PSDs", order: 7, install: "none", blurb: "Photoshop layer-style packs — download only." },
  "Windows Themes": { label: "Windows Themes (deprecated)", order: 8, install: "none", blurb: "Only worked on Windows 10; kept for the archive." },
};

export function categoryMeta(folder: string): SpecialsCategoryMeta {
  return SPECIALS_CATEGORIES[folder] ?? { label: folder, order: 99, install: "none" };
}

/** Curated display names for the messier upload filenames (keyed by filename, ext included).
 *  Anything not listed falls back to the cleanup heuristic below. */
export const DISPLAY_NAMES: Record<string, string> = {
  "capitaine_cursors_by_krourke_dabmjtm.zip": "Capitaine Cursors",
  "crystal-clear-v41_15ea7bc47b_VSTHEMES.ORG.zip": "Crystal Clear v4.1",
  "cursor_concept_2_free_by_jepricreations_diumd8p.zip": "Cursor Concept 2",
  "cursor_sans_family.zip": "Cursor Sans Family",
  "diamos-pack.zip": "Diamos",
  "DIM-v4-TechnoBlue-main.zip": "DIM v4 TechnoBlue",
  "kami-v2-jet-black_73c22b2073_VSTHEMES.ORG.zip": "Kami v2 Jet Black",
  "macOS.zip": "macOS Cursors",
  "Maverick_Rounded_Cursors.zip": "Maverick Rounded",
  "nero-cybercyan_7228e1eda9_VSTHEMES.ORG.zip": "Nero CyberCyan",
  "Night Diamond v3.0.zip": "Night Diamond v3.0",
  "Posy's Cursor Mono Black.zip": "Posy's Cursor Mono Black",
  "saber-fate_f4837258b3_VSTHEMES-ORG.zip": "Saber (Fate)",
  "Simplify Tip - Windows Cursors by dpcdpc11.zip": "Simplify Tip",
  "Simplify_Circle_Cursors.zip": "Simplify Circle",
  "Simplify_Dot_2_Cursors.zip": "Simplify Dot 2",
  "Simplify_Handy_Cursors.zip": "Simplify Handy",
  "Simplify_Minimal_Cursors.zip": "Simplify Minimal",
  "simplify_pointy_windows_cursors.zip": "Simplify Pointy",
  "ubuntu__human__cursors_by_nordlicht_dle4ja.zip": "Ubuntu Human Cursors",
  "vision_cursor.zip": "Vision Cursor",
  "vs_cursor_11_0_by_vladsukhetskyi_devx8ne.zip": "VS Cursor 11.0",
  "vs_cursor_12_0__early.zip": "VS Cursor 12.0 (Early)",
  "vs_cursor__version_8_0__by_vladsukhetskyi_deq37tz.zip": "VS Cursor 8.0",
  "windows_11_fluent_cursor_v3_by_arteffect10520_dgp6h69.zip": "Windows 11 Fluent v3",
  "Chroma_Cursors.zip": "Chroma Cursors",
  "gotham-black-font.zip": "Gotham Black",
  "Bonbon-Font.zip": "Bonbon",
  "Metropolis-Black.zip": "Metropolis Black",
  "keep_calm.zip": "Keep Calm",
  "Mononoki.zip": "Mononoki",
  "komika_axis.zip": "Komika Axis",
  "mods.zip": "Mods Pack (goes in PAYDAY 2\\mods)",
  "assets.zip": "Assets Pack (goes in PAYDAY 2\\assets)",
  "Anime Sounds.zip": "Anime Sounds",
  "Linux Ubuntu.zip": "Linux Ubuntu Sounds",
  "Paranoid Android.zip": "Paranoid Android (Windows 10 only)",
};

/** Fallback cleanup for unmapped filenames: strips extensions, deviantart-style
 *  author/hash suffixes and site tags, then title-cases the remainder. */
export function displayName(filename: string): string {
  const curated = DISPLAY_NAMES[filename];
  if (curated) return curated;

  let s = filename.replace(/\.[^.]+$/, "");
  s = s.replace(/_[a-f0-9]{10,}/gi, ""); // hash tokens
  s = s.replace(/VSTHEMES[.-]ORG/gi, "");
  s = s.replace(/[_ -]*by[_ -][a-z0-9]+([_ -]d[a-z0-9]{6})?$/i, ""); // "by author_dXXXXXX"
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s
    .split(" ")
    .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
