import type { SpecialsItem } from "../state/specialsContentStore";
import { SPECIALS_WORKER_URL } from "./specialsConfig";
import paydayTile from "../assets/app-icons/payday2-mods.png";
import photoshopTile from "../assets/app-icons/photoshop.png";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"]);
const PAYDAY_FOLDER = "Payday 2 Mods - Diesel 2.0";

export function gatedUrl(objectKey: string, sessionKey: string | null): string {
  return `${SPECIALS_WORKER_URL}/file/${objectKey.split("/").map(encodeURIComponent).join("/")}?key=${encodeURIComponent(sessionKey ?? "")}`;
}

/** The `Tweaks/<folder>/...` category folder an item lives in. */
export function itemFolder(item: SpecialsItem): string {
  const parts = item.objectKey.split("/");
  return parts[1] ?? "";
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
  if (itemFolder(item) === PAYDAY_FOLDER) return [paydayTile];
  return [];
}
