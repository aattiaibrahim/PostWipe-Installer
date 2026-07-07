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
  siLibrewolf,
  siZenbrowser,
  siDiscord,
  siTelegram,
  siTeamspeak,
  siNvidia,
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
  librewolf: siLibrewolf,
  "zen-browser": siZenbrowser,
  discord: siDiscord,
  telegram: siTelegram,
  teamspeak: siTeamspeak,
  "nvidia-profile-inspector": siNvidia,
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
