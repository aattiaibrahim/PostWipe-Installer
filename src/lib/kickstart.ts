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
  /** Logos to show for an option that adds no apps itself but unlocks a follow-up step — a
   *  taste of what that path leads to. Display only; never recommended from here. */
  preview?: string[];
  /** Category glyph, for an option with neither apps nor a preview (e.g. "Keep it simple"). */
  icon?: string;
}

export interface KickstartStep {
  id: string;
  title: string;
  subtitle?: string;
  /** One answer only (e.g. experience level) instead of pick-any. */
  single?: boolean;
  /** Show this step only when an earlier answer calls for it. */
  when?: (answers: KickstartAnswers) => boolean;
  options: KickstartOption[];
}

/** Step id -> the option ids picked on that step. */
export type KickstartAnswers = Record<string, string[]>;

const picked = (answers: KickstartAnswers, step: string, option: string) => answers[step]?.includes(option) ?? false;

/** Tools that are great for power users and confusing (or risky, in DDU's case) for everyone
 *  else. "Keep it simple" drops them even when another answer would have added them. */
const ADVANCED_APPS = new Set([
  "ddu",
  "timer-resolution",
  "process-explorer",
  "autoruns",
  "nvidia-profile-inspector",
  "prowlarr",
  "flaresolverr",
  "putty",
]);

/** The very first screen: what machine this is. Asked up front (not mid-wizard) because the
 *  answers decide everything after it — which OS's downloads exist, which vendor tools apply —
 *  and the OS choice also switches the app's own OS when Kickstart finishes. Both answers come
 *  pre-filled from this computer (detected on launch), so it's usually just "Next". Graphics
 *  isn't asked: nothing in the catalog depends on the GPU brand. */
export interface DeviceChoice {
  id: string;
  label: string;
}

export interface DeviceGroup {
  id: "os" | "cpu";
  label: string;
  /** Choices depend on the OS picked (Macs have Apple Silicon). */
  choices: (os: Os) => DeviceChoice[];
}

export const DEVICE_GROUPS: DeviceGroup[] = [
  {
    id: "os",
    label: "Operating system",
    choices: () => [
      { id: "windows", label: "Windows" },
      { id: "macos", label: "macOS" },
    ],
  },
  {
    id: "cpu",
    label: "Processor",
    choices: (os) =>
      os === "macos"
        ? [
            { id: "apple", label: "Apple Silicon" },
            { id: "intel", label: "Intel" },
          ]
        : [
            { id: "intel", label: "Intel" },
            { id: "amd", label: "AMD" },
          ],
  },
];

export const deviceOs = (answers: KickstartAnswers): Os => (answers.os?.[0] === "macos" ? "macos" : "windows");

export const KICKSTART_STEPS: KickstartStep[] = [
  {
    id: "uses",
    title: "What do you use this computer for?",
    subtitle: "Pick everything that applies. Everyday basics are always included.",
    options: [
      { id: "gaming", label: "Gaming", hint: "Launchers and performance tools", preview: ["steam", "epic-games", "battle-net"], apps: [], reason: "" },
      { id: "create", label: "Streaming & creating", hint: "Recording, screenshots, editing", preview: ["obs-studio", "sharex", "losslesscut"], apps: [], reason: "" },
      { id: "dev", label: "Coding & dev", hint: "Editors, Git, containers, VMs", preview: ["vscode", "git", "docker-desktop"], apps: [], reason: "" },
      {
        id: "music",
        label: "Listening to music",
        hint: "Streaming and Discord status",
        apps: ["spotify", "music-presence"],
        reason: "You listen to music",
      },
      { id: "printing", label: "3D printing", hint: "Slicer for Bambu Lab printers", apps: ["bambu-studio"], reason: "You 3D print" },
      {
        id: "remote",
        label: "Remote access",
        hint: "Control or help another PC",
        apps: ["rustdesk", "teamviewer"],
        reason: "You connect to other computers",
      },
      { id: "media", label: "Downloads & media server", hint: "Torrents, Sonarr/Radarr, Plex", preview: ["qbittorrent", "sonarr", "plex"], apps: [], reason: "" },
      {
        id: "privacy",
        label: "Privacy & security",
        hint: "VPN and a password manager",
        apps: ["windscribe", "bitwarden"],
        reason: "You care about privacy",
      },
    ],
  },
  {
    id: "experience",
    title: "How comfortable are you tweaking your PC?",
    subtitle: "This decides how many advanced tools make the list.",
    single: true,
    options: [
      { id: "simple", label: "Keep it simple", hint: "Just the apps I'll actually use", apps: [], reason: "", icon: "__all__" },
      {
        id: "comfortable",
        label: "I know my way around",
        hint: "A few handy utilities too",
        apps: ["powertoys", "twinkle-tray", "7-zip"],
        reason: "Handy everyday utilities",
      },
      {
        id: "power",
        label: "Power user",
        hint: "Monitoring, startup and driver tools",
        apps: ["powertoys", "process-explorer", "autoruns", "hwinfo", "notepad-plus-plus"],
        reason: "Power-user tools",
      },
    ],
  },
  {
    id: "hardware",
    title: "What hardware do you have?",
    subtitle: "Gear you own gets its companion app. Skip anything you don't have.",
    options: [
      { id: "elgato", label: "Elgato Stream Deck", apps: ["elgato-stream-deck"], reason: "You have an Elgato Stream Deck" },
      { id: "focusrite", label: "Focusrite audio interface", apps: ["focusrite-control"], reason: "You have a Focusrite interface" },
      { id: "insta360", label: "Insta360 Link webcam", apps: ["insta360-link-controller"], reason: "You have an Insta360 Link" },
      { id: "endgame", label: "Endgame Gear OP1 8K mouse", apps: ["endgame-op1-8k-v2"], reason: "You have an Endgame Gear mouse" },
      { id: "bambu", label: "Bambu Lab 3D printer", apps: ["bambu-studio"], reason: "You have a Bambu Lab printer" },
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
      { id: "ai", label: "AI coding assistants", apps: ["claude-desktop", "codex"], reason: "You code with AI" },
    ],
  },
  {
    id: "media",
    title: "What should your media setup do?",
    when: (a) => picked(a, "uses", "media"),
    options: [
      { id: "torrents", label: "Download torrents", apps: ["qbittorrent"], reason: "You download torrents" },
      { id: "tv", label: "Grab TV shows automatically", apps: ["sonarr", "prowlarr"], reason: "You automate TV downloads" },
      { id: "movies", label: "Grab movies automatically", apps: ["radarr", "prowlarr"], reason: "You automate movie downloads" },
      { id: "music-lib", label: "Grab music automatically", apps: ["lidarr", "prowlarr"], reason: "You automate music downloads" },
      { id: "plex", label: "Stream your library", hint: "To your TV or phone", apps: ["plex"], reason: "You stream your media library" },
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
      { id: "passwords", label: "Password manager", apps: ["bitwarden"], reason: "Keeps your logins safe" },
      { id: "archives", label: "Open zip & rar files", apps: ["7-zip"], reason: "Opens .zip, .rar and .7z files" },
      { id: "notes", label: "Notes", apps: ["obsidian"], reason: "You take notes" },
      { id: "flashcards", label: "Study flashcards", apps: ["anki"], reason: "You study with flashcards" },
    ],
  },
];

/** Default answers: a sensible starting point, so hitting Next through every step still
 *  produces a useful list. The first step starts empty on purpose — guessing someone's a
 *  gamer is presumptuous in a way that pre-ticking "password manager" isn't. */
export const KICKSTART_DEFAULTS: KickstartAnswers = {
  os: ["windows"],
  cpu: [],
  uses: [],
  experience: ["comfortable"],
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
export function recommend(catalog: Catalog, answers: KickstartAnswers): Recommendation[] {
  const os = deviceOs(answers);
  const cpu = answers.cpu?.[0];
  const apps = new Map(catalog.categories.flatMap((c) => c.apps).map((a) => [a.id, a]));
  const simple = picked(answers, "experience", "simple");
  const out = new Map<string, Recommendation>();

  const add = (id: string, reason: string) => {
    if (simple && ADVANCED_APPS.has(id)) return;
    // The catalog's macOS VirtualBox is the Apple Silicon build; it won't run on an Intel Mac.
    if (id === "virtualbox" && os === "macos" && cpu === "intel") return;
    const app = apps.get(id);
    if (!app || app.kind !== "download" || !app.platforms[os]?.resolver) return;
    const existing = out.get(id);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      out.set(id, { app, reasons: [reason] });
    }
  };

  for (const step of visibleSteps(answers)) {
    for (const option of step.options) {
      if (!answers[step.id]?.includes(option.id)) continue;
      for (const id of option.apps) add(id, option.reason);
    }
  }

  const tuning = picked(answers, "gaming", "tuning") || picked(answers, "experience", "power");
  if (tuning) add("msi-afterburner", "Tunes and monitors your graphics card");
  // AMD Ryzen memory tuning is vendor-specific (tagged vendor: amd in the catalog).
  if (tuning && cpu === "amd") add("zentimings", "Shows your AMD Ryzen memory timings");

  return [...out.values()];
}
