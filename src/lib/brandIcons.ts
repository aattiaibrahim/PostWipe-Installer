import {
  siSteam,
  siEpicgames,
  siGogdotcom,
  siBattledotnet,
  siUbisoft,
  siEa,
  si7zip,
  siBitwarden,
  siPycharm,
  siNotepadplusplus,
  siBrave,
  siFirefoxbrowser,
  siLibrewolf,
  siZenbrowser,
  siDiscord,
  siTelegram,
  siTeamspeak,
  siNvidia,
  siRiotgames,
  siSpotify,
  siTidal,
  siQbittorrent,
  siDeluge,
  siSharex,
  siMsi,
} from "simple-icons";

export interface BrandIcon {
  path: string;
  hex: string;
}

export const BRAND_ICONS: Record<string, BrandIcon> = {
  steam: siSteam,
  "epic-games": siEpicgames,
  "gog-galaxy": siGogdotcom,
  "battle-net": siBattledotnet,
  "ubisoft-connect": siUbisoft,
  "ea-app": siEa,
  "7-zip": si7zip,
  bitwarden: siBitwarden,
  pycharm: siPycharm,
  "notepad-plus-plus": siNotepadplusplus,
  brave: siBrave,
  firefox: siFirefoxbrowser,
  librewolf: siLibrewolf,
  "zen-browser": siZenbrowser,
  discord: siDiscord,
  telegram: siTelegram,
  teamspeak: siTeamspeak,
  "nvidia-profile-inspector": siNvidia,
  "nvidia-broadcast": siNvidia,
  "riot-client": siRiotgames,
  spotify: siSpotify,
  tidal: siTidal,
  qbittorrent: siQbittorrent,
  deluge: siDeluge,
  sharex: siSharex,
  "msi-afterburner": siMsi,
};

const MONOGRAM_COLORS = ["#6d8cff", "#b06cf7", "#4fd1c5", "#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#f87171"];

export function monogramColor(appId: string): string {
  let hash = 0;
  for (let i = 0; i < appId.length; i++) hash = (hash * 31 + appId.charCodeAt(i)) >>> 0;
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length];
}

/// Relative luminance (WCAG-style approximation) of a "#rrggbb" or "rrggbb" hex color, 0 (black) to 1 (white).
export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Every app icon sits on the same dark tile. A brand's own colour is kept but lifted to at
 *  least 62% lightness so it reads on that tile (Riot's red, GOG's purple); near-greyscale
 *  marks like Steam's black simply become white. */
export function readableOnDark(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.18) return l < 0.62 ? "#f5f5f7" : `#${clean}`;
  if (l >= 0.62) return `#${clean}`;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  const nl = 0.62;
  const c = (1 - Math.abs(2 * nl - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = nl - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hx = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hx(rr)}${hx(gg)}${hx(bb)}`;
}
