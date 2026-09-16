import type { AppEntry, Catalog, Os } from "../types/catalog";

/** Kickstart: a few questions about how someone uses their computer, turned into a
 *  pre-checked list of apps to download.
 *
 *  Kept as plain data so questions and picks can be tuned without touching the dialog. Every
 *  option names the catalog app ids it recommends and a short reason, which the review screen
 *  shows next to each app — "because you stream" — so nothing on the list is unexplained.
 *  Ids that don't exist on the current OS are skipped, so one set of questions serves Windows
 *  and macOS. */

export interface KickstartOption {
  id: string;
  label: string;
  hint?: string;
  apps: string[];
  reason: string;
}

export interface KickstartStep {
  id: string;
  title: string;
  subtitle?: string;
  /** Show this step only when an earlier answer calls for it. */
  when?: (answers: KickstartAnswers) => boolean;
  options: KickstartOption[];
}

/** Step id -> the option ids picked on that step. */
export type KickstartAnswers = Record<string, string[]>;

const picked = (answers: KickstartAnswers, step: string, option: string) => answers[step]?.includes(option) ?? false;

export const KICKSTART_STEPS: KickstartStep[] = [
  {
    id: "uses",
    title: "What do you use this computer for?",
    subtitle: "Pick everything that applies. Everyday basics are always included.",
    options: [
      { id: "gaming", label: "Gaming", hint: "Launchers and performance tools", apps: [], reason: "" },
      { id: "create", label: "Streaming & creating", hint: "Recording, screenshots, editing", apps: [], reason: "" },
      { id: "dev", label: "Coding & dev", hint: "Editors, Git, containers, VMs", apps: [], reason: "" },
    ],
  },
  {
    id: "gaming",
    title: "Where do you play?",
    subtitle: "We'll get the launchers for the stores you use.",
    when: (a) => picked(a, "uses", "gaming"),
    options: [
      { id: "steam", label: "Steam", apps: ["steam"], reason: "You play on Steam" },
      { id: "epic", label: "Epic Games", apps: ["epic-games"], reason: "You play on Epic" },
      { id: "battlenet", label: "Battle.net", hint: "Overwatch, Diablo, WoW", apps: ["battle-net"], reason: "You play Blizzard games" },
      { id: "riot", label: "Riot", hint: "League, Valorant", apps: ["riot-client"], reason: "You play Riot games" },
      { id: "ea", label: "EA", apps: ["ea-app"], reason: "You play EA games" },
      { id: "ubisoft", label: "Ubisoft", apps: ["ubisoft-connect"], reason: "You play Ubisoft games" },
      { id: "gog", label: "GOG", apps: ["gog-galaxy"], reason: "You play on GOG" },
      { id: "starcitizen", label: "Star Citizen", apps: ["rsi-launcher"], reason: "You play Star Citizen" },
      {
        id: "tuning",
        label: "Tune performance",
        hint: "FPS overlay, temps, GPU tuning",
        apps: ["msi-afterburner", "hwinfo"],
        reason: "You want to monitor and tune performance",
      },
    ],
  },
  {
    id: "create",
    title: "What do you make?",
    when: (a) => picked(a, "uses", "create"),
    options: [
      { id: "stream", label: "Stream or record", apps: ["obs-studio", "nvidia-broadcast"], reason: "You stream or record" },
      { id: "capture", label: "Screenshots & GIFs", apps: ["sharex", "screentogif"], reason: "You capture your screen" },
      { id: "edit", label: "Trim & convert video", apps: ["losslesscut", "handbrake"], reason: "You work with video" },
      { id: "streamdeck", label: "Use a Stream Deck", apps: ["elgato-stream-deck"], reason: "You use an Elgato Stream Deck" },
    ],
  },
  {
    id: "dev",
    title: "What do you work with?",
    when: (a) => picked(a, "uses", "dev"),
    options: [
      { id: "editor", label: "Code editor", apps: ["vscode", "notepad-plus-plus"], reason: "You write code" },
      { id: "git", label: "Git & remote shells", apps: ["git", "putty"], reason: "You use Git and SSH" },
      { id: "containers", label: "Containers", apps: ["docker-desktop"], reason: "You run containers" },
      { id: "vms", label: "Virtual machines", apps: ["virtualbox"], reason: "You run virtual machines" },
      {
        id: "power",
        label: "Windows power tools",
        apps: ["powertoys", "process-explorer", "autoruns"],
        reason: "You like power-user tools",
      },
      { id: "ai", label: "AI coding assistants", apps: ["claude-desktop", "codex"], reason: "You code with AI" },
    ],
  },
  {
    id: "browser",
    title: "Which browser do you want?",
    subtitle: "Skip this if you're happy with the one you have.",
    options: [
      { id: "brave", label: "Brave", hint: "Chrome-like, blocks ads", apps: ["brave"], reason: "Your browser pick" },
      { id: "firefox", label: "Firefox", apps: ["firefox"], reason: "Your browser pick" },
      { id: "zen", label: "Zen", hint: "Firefox with vertical tabs", apps: ["zen-browser"], reason: "Your browser pick" },
      { id: "librewolf", label: "LibreWolf", hint: "Privacy-hardened Firefox", apps: ["librewolf"], reason: "Your browser pick" },
    ],
  },
  {
    id: "everyday",
    title: "And the everyday stuff?",
    options: [
      { id: "discord", label: "Discord", apps: ["discord"], reason: "You chat on Discord" },
      { id: "telegram", label: "Telegram", apps: ["telegram"], reason: "You chat on Telegram" },
      { id: "spotify", label: "Spotify", apps: ["spotify"], reason: "You listen on Spotify" },
      { id: "tidal", label: "Tidal", apps: ["tidal"], reason: "You listen on Tidal" },
      { id: "passwords", label: "Password manager", apps: ["bitwarden"], reason: "Keeps your logins safe" },
      { id: "archives", label: "Open zip & rar files", apps: ["7-zip"], reason: "Opens .zip, .rar and .7z files" },
      { id: "notes", label: "Notes", apps: ["obsidian"], reason: "You take notes" },
      { id: "vpn", label: "VPN", apps: ["windscribe"], reason: "You want a VPN" },
    ],
  },
];

/** Default answers: a sensible starting point, so hitting Next through every step still
 *  produces a useful list. The first step starts empty on purpose — guessing someone's a
 *  gamer is presumptuous in a way that pre-ticking "password manager" isn't. */
export const KICKSTART_DEFAULTS: KickstartAnswers = {
  uses: [],
  everyday: ["passwords", "archives"],
};

export function visibleSteps(answers: KickstartAnswers): KickstartStep[] {
  return KICKSTART_STEPS.filter((step) => !step.when || step.when(answers));
}

export interface Recommendation {
  app: AppEntry;
  reasons: string[];
}

/** Downloadable apps for `os` from the answers, in question order, deduplicated (an app picked
 *  for two reasons lists both). Entries without a working download on this OS are dropped —
 *  Kickstart only offers what it can actually fetch. */
export function recommend(catalog: Catalog, os: Os, answers: KickstartAnswers): Recommendation[] {
  const apps = new Map(catalog.categories.flatMap((c) => c.apps).map((a) => [a.id, a]));
  const out = new Map<string, Recommendation>();
  for (const step of visibleSteps(answers)) {
    for (const option of step.options) {
      if (!answers[step.id]?.includes(option.id)) continue;
      for (const id of option.apps) {
        const app = apps.get(id);
        if (!app || app.kind !== "download" || !app.platforms[os]?.resolver) continue;
        const existing = out.get(id);
        if (existing) {
          if (!existing.reasons.includes(option.reason)) existing.reasons.push(option.reason);
        } else {
          out.set(id, { app, reasons: [option.reason] });
        }
      }
    }
  }
  return [...out.values()];
}
