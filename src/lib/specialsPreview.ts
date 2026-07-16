import type { SpecialsItem } from "../state/specialsContentStore";
import { SPECIALS_WORKER_URL } from "./specialsConfig";
import paydayTile from "../assets/app-icons/payday2-mods.png";
import photoshopTile from "../assets/app-icons/photoshop.png";
import sennheiserTile from "../assets/app-icons/sennheiser-hd650.png";
import windowsThemesTile from "../assets/app-icons/windows-themes.png";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"]);
const PAYDAY_FOLDER = "Payday 2 Mods - Diesel 2.0";
const AUDIO_EQ_FOLDER = "Audio & EQ Profiles";
const WINDOWS_THEMES_FOLDER = "Windows Themes";

export function gatedUrl(objectKey: string, sessionKey: string | null): string {
  return `${SPECIALS_WORKER_URL}/file/${objectKey.split("/").map(encodeURIComponent).join("/")}?key=${encodeURIComponent(sessionKey ?? "")}`;
}

/** A full-width banner image for categories that are really "one thing" — the Payday mod
 *  pack shows its composite across the whole gallery. Null for normal categories. */
export function categoryHeroImage(folder: string): string | null {
  return folder === PAYDAY_FOLDER ? paydayTile : null;
}

/** Art for a FOLDER cover card (category or subfolder), keyed by its name. This is where
 *  the Sennheiser headphones belong — the folder represents the headphone, while the files
 *  inside it (PDFs, presets, apps) keep their own per-file icons. */
const FOLDER_COVERS: Record<string, string> = {
  [AUDIO_EQ_FOLDER]: sennheiserTile,
  "Sennheiser 650": sennheiserTile,
};

export function folderCoverImage(name: string): string | null {
  return FOLDER_COVERS[name] ?? null;
}

/** The `Tweaks/<folder>/...` category folder an item lives in. */
export function itemFolder(item: SpecialsItem): string {
  const parts = item.objectKey.split("/");
  return parts[1] ?? "";
}

/** The item's own full file when it's itself an image — used by the detail sheet to show the
 *  full-res / animated original, while the grid uses the small uploaded thumbnail (see
 *  resolvePreviews). Null for non-image items (cursors, sounds, …). */
export function ownImageUrl(item: SpecialsItem, sessionKey: string | null): string | null {
  return IMAGE_EXTS.has(item.ext) ? gatedUrl(item.objectKey, sessionKey) : null;
}

/** Every image to show for an item, in order (a carousel for multi-angle packs):
 *  1. uploaded previews/<stem> images (cursors, steam profiles, …)
 *  2. the file itself when it's already an image (wallpapers, profile pics, banners)
 *  3. a bundled brand tile for categories/types with no art (PSDs → Photoshop, Payday mods)
 *  Empty = no image; the caller falls back to a ♪ glyph (sounds) or the name's initial. */
export function resolvePreviews(item: SpecialsItem, sessionKey: string | null): string[] {
  if (item.previewKeys.length > 0) return item.previewKeys.map((k) => gatedUrl(k, sessionKey));
  if (IMAGE_EXTS.has(item.ext)) return [gatedUrl(item.objectKey, sessionKey)];
  if (item.ext === "psd") return [photoshopTile];
  const folder = itemFolder(item);
  if (folder === PAYDAY_FOLDER) return [paydayTile];
  if (folder === WINDOWS_THEMES_FOLDER) return [windowsThemesTile];
  // NOTE: Audio & EQ deliberately has NO item-level art — the headphones belong on the
  // folder cover (see folderCoverImage), not stamped on every PDF/preset/app inside it.
  return [];
}
