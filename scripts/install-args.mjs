// How "Install for me" runs each Windows installer. It writes `platforms.windows.install` into
// catalog/ and public/catalog.json:
//
//   node scripts/install-args.mjs           (prints the plan)
//   node scripts/install-args.mjs --write   (updates both catalogs)
//
// The engines come from scripts/detect-installers.mjs. The fields:
//   args      silent switches. Without them the installer opens its own window, and the app
//             waits for it to close before starting the next one.
//   admin     true = runs inside the ONE elevated batch (a single UAC prompt for all of them).
//             false = runs as the signed-in user. That matters: running a per-user installer
//             elevated can put the app in the wrong profile, and Spotify refuses outright.
//             An installer marked false that turns out to need admin just asks for it itself,
//             so a wrong `false` costs one extra prompt, while a wrong `true` can break the
//             install. When in doubt, it's false.
//   portable  the download IS the app (no installer); Install for me leaves it in the folder.
//
// Rust reads these from the catalog compiled into the app. Nothing from the webview picks
// the arguments.
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WRITE = process.argv.includes("--write");

const INNO = ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"];
const NSIS = ["/S"];
const SQUIRREL = ["--silent"];
const BURN = ["/quiet", "/norestart"];

/** appId → install spec. Engines verified with detect-installers.mjs on 2026-09-19. */
const PLAN = {
  // Inno Setup. The loader always runs as the user and re-launches itself elevated when the
  // script needs admin, so the manifest can't tell; these install per-machine.
  "bsg-launcher": { args: INNO, admin: true },
  "cpu-z": { args: INNO, admin: true },
  "focusrite-control": { args: INNO, admin: true },
  git: { args: INNO, admin: true },
  hwmonitor: { args: INNO, admin: true },
  "insta360-link-controller": { args: INNO, admin: true },
  lidarr: { args: INNO, admin: true },
  prowlarr: { args: INNO, admin: true },
  radarr: { args: INNO, admin: true },
  sonarr: { args: INNO, admin: true },
  sharex: { args: INNO, admin: true },
  // Per-user Inno installers (they install under AppData).
  telegram: { args: INNO, admin: false },
  // !runcode stops VS Code from opening itself at the end of a silent install.
  vscode: { args: [...INNO, "/MERGETASKS=!runcode"], admin: false },
  "wargaming-game-center": { args: INNO, admin: false },

  // NSIS. `admin` follows the manifest (requireAdministrator / highestAvailable = true).
  "bambu-studio": { args: NSIS, admin: true },
  deluge: { args: NSIS, admin: true },
  handbrake: { args: NSIS, admin: true },
  librewolf: { args: NSIS, admin: true },
  "notepad-plus-plus": { args: NSIS, admin: true },
  "obs-studio": { args: NSIS, admin: true },
  "rsi-launcher": { args: NSIS, admin: true },
  steam: { args: NSIS, admin: true },
  teamspeak: { args: NSIS, admin: true },
  "ubisoft-connect": { args: NSIS, admin: true },
  // asInvoker in the manifest but installs into Program Files (elevates through its UAC plugin).
  pycharm: { args: NSIS, admin: true },
  qbittorrent: { args: NSIS, admin: true },
  teamviewer: { args: NSIS, admin: true },
  // electron-builder one-click installers: per-user.
  bitwarden: { args: NSIS, admin: false },
  houdoku: { args: NSIS, admin: false },
  "music-presence": { args: NSIS, admin: false },
  obsidian: { args: NSIS, admin: false },
  "twinkle-tray": { args: NSIS, admin: false },
  flux: { args: NSIS, admin: false },
  plex: { args: NSIS, admin: false },
  // DDU's "setup" only unpacks the portable tool to a folder you choose: keep it interactive.
  ddu: { admin: true },

  // Squirrel.Windows (per-user by design).
  "claude-desktop": { args: SQUIRREL, admin: false },
  discord: { args: SQUIRREL, admin: false },
  qobuz: { args: SQUIRREL, admin: false },
  tidal: { args: SQUIRREL, admin: false },

  // WiX Burn bundles.
  "ea-app": { args: BURN, admin: true },
  powertoys: { args: BURN, admin: false }, // the per-user build (PowerToysUserSetup)

  // Mozilla-style 7-Zip SFX around an NSIS setup; /S is documented for both.
  firefox: { args: NSIS, admin: true },
  "zen-browser": { args: NSIS, admin: true },

  // Custom engines with documented silent switches.
  "7-zip": { args: NSIS, admin: true },
  winrar: { args: NSIS, admin: true },
  spotify: { args: ["/silent"], admin: false }, // refuses to install elevated
  // Verified silent on a clean runner 2026-09-19 (second pass over the "wizard-only" list).
  brave: { args: ["/silent", "/install"], admin: false }, // Omaha stub, per-user like Chrome's
  rustdesk: { args: ["--silent-install"], admin: true }, // installs its service
  windscribe: { args: ["-silent"], admin: true }, // installs its VPN adapter
  hwinfo: { args: INNO, admin: true },
  virtualbox: { args: ["--silent", "--ignore-reboot"], admin: true },
  netlimiter: { args: ["/exenoui", "/qn"], admin: true }, // Advanced Installer EXE wrapper

  // No working silent mode (or a choice only the user can make): downloaded and listed under
  // "Needs you" with a Run installer button. Never opened automatically.
  "nvidia-broadcast": { admin: true }, // "-s" exits with an error
  "docker-desktop": {}, // its silent mode means accepting Docker's license for the user
  "battle-net": {}, // "--silent" still shows its window (hung 10 min on the runner)
  "gog-galaxy": {}, // Inno switches ignored: its window stays up
  "riot-client": {},
  "equalizer-apo": {}, // asks which audio devices to hook, which only the user can answer
  peace: {},
  vencord: {}, // a patcher with its own UI, not an installer

  // The download is the program itself.
  codex: { portable: true },
  deceive: { portable: true },
  "timer-resolution": { portable: true },
};

const eol = (raw) => (raw.includes("\r\n") ? "\r\n" : "\n");
let missing = 0;
for (const path of ["catalog/catalog.json", "public/catalog.json"]) {
  const raw = readFileSync(ROOT + path, "utf8");
  const catalog = JSON.parse(raw);
  const seen = new Set();
  for (const app of catalog.categories.flatMap((c) => c.apps)) {
    const win = app.platforms?.windows;
    if (!win) continue;
    const spec = PLAN[app.id];
    const file = (win.filename ?? "").toLowerCase();
    if (spec) {
      seen.add(app.id);
      win.install = spec;
    } else {
      delete win.install;
      if (path.startsWith("catalog/") && /\.(exe)$/.test(file)) {
        console.log(`no plan: ${app.id} (${file}) → opens its own installer`);
        missing++;
      }
    }
  }
  for (const id of Object.keys(PLAN)) if (!seen.has(id)) console.log(`${path}: plan for unknown app ${id}`);
  if (WRITE) writeFileSync(ROOT + path, JSON.stringify(catalog, null, 2).replace(/\n/g, eol(raw)) + eol(raw));
}
const counts = { silentAdmin: 0, silentUser: 0, interactive: 0, portable: 0 };
for (const s of Object.values(PLAN)) {
  if (s.portable) counts.portable++;
  else if (!s.args) counts.interactive++;
  else if (s.admin) counts.silentAdmin++;
  else counts.silentUser++;
}
console.log(JSON.stringify(counts), missing ? `${missing} exe without a plan` : "");
console.log(WRITE ? "catalogs updated" : "(dry run; --write to apply)");
