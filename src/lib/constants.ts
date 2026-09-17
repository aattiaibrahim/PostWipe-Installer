export const ALL_CATEGORY_ID = "__all__";
/** Virtual sidebar entry listing the signed-in account's starred apps. Not a catalog category. */
export const FAVORITES_CATEGORY_ID = "__favorites__";
/** Virtual sidebar entry: the storefront-style landing page. Not a catalog category. */
export const HOME_CATEGORY_ID = "__home__";
/** The Downloads page: in-progress jobs plus every file in PostWipeDownloads. */
export const DOWNLOADS_CATEGORY_ID = "__downloads__";

/** Curated "Essentials" shelf on Home, in display order. Apps missing on the current OS are
 *  skipped, so one list serves Windows and macOS. */
export const ESSENTIAL_APP_IDS = [
  "brave",
  "discord",
  "steam",
  "spotify",
  "7-zip",
  "nanazip",
  "vscode",
  "obsidian",
  "bitwarden",
  "powertoys",
  "sharex",
  "obs-studio",
  "qbittorrent",
  "notepad-plus-plus",
  "handbrake",
];

/** "Recently added" shelf on Home, newest first. Hand-maintained: the catalog carries no
 *  added-on dates. Prepend new entries when adding apps. */
export const RECENTLY_ADDED_APP_IDS = [
  "virtualbox",
  "vmware-workstation",
  "vmware-fusion",
  "obsidian",
  "rustdesk",
  "teamviewer",
  "endgame-op1-8k-v2",
  "nvidia-broadcast",
  "rsi-launcher",
  "bambu-studio",
];
