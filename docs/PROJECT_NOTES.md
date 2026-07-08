# PostWipe Installer — Project Notes

Living reference for architecture, decisions, and the feature backlog. Read this before making
non-trivial changes; update it when the shape of the app changes or a big backlog item lands.

## What this is

A Tauri + React/TypeScript desktop app that replaces a single-file Tkinter/Python script for
downloading a curated set of apps after a fresh Windows/macOS wipe. Data-driven catalog, real
network resolvers, concurrent downloads, auto-updating via CI.

## Architecture

- **Catalog** (`catalog/catalog.json`, schema in `catalog/catalog.schema.json`): source of truth
  for categories → apps → per-OS resolver spec. Adding/fixing an app is a data edit, not a code
  change. Rust model in `src-tauri/src/catalog/model.rs`, TS mirror in `src/types/catalog.ts`.
- **Resolvers** (`src-tauri/src/resolver/`): `static` (direct URL), `github_release` (GitHub API +
  glob asset match), `html` (fetch + CSS selector via `scraper`). No browser-rendering resolver
  exists yet — see "JS-rendered pages" below.
- **Download manager** (`src-tauri/src/downloader/`): semaphore-bounded concurrency, `.part`-file
  atomic writes, connect/stall/safety timeouts, progress events. Commands dispatch via
  `tauri::async_runtime::spawn`, **not** `tokio::spawn` — see Known Issues, this bit us once.
- **Frontend**: Zustand stores (`catalogStore`, `downloadQueueStore`), framer-motion for
  animation, custom frameless title bar (`decorations: false` + our own drag region/window
  controls), self-hosted Inter variable font, `simple-icons` for brand logos with a luminance-based
  chip background (falls back to a colored monogram for apps without a real brand-icon match).
- **CI/CD** (`.github/workflows/release.yml`): every push to `master` auto-bumps the patch version,
  builds, signs (via `tauri-apps/tauri-action`), and publishes a GitHub Release with `latest.json`
  for the updater. Signing key lives only as a GitHub Actions secret + locally at
  `src-tauri/updater-signing-key.pem` (gitignored, never commit it).

## Known issues / stale catalog entries

- Entries marked `"stale": true` in the catalog need manual re-verification (pinned versions,
  unconfirmed URLs). Check the `notes` field on each for specifics.
- **JS-rendered pages the `html` resolver cannot solve**: Windscribe, TeamSpeak, PyCharm. Their
  download links only exist after client-side JS runs — a plain HTML fetch + CSS selector never
  sees them. This is a real, solvable problem (not a dead end) — see "Resolver for JS-rendered
  pages" in the backlog below for the plan.
- The original Windscribe "crash" (2026-07-07) was **not** a resolver bug — it was
  `tokio::spawn` being called from a Tauri sync-command thread with no ambient Tokio runtime,
  which panicked across a WebView2 FFI boundary and hard-aborted the process. Fixed by switching
  to `tauri::async_runtime::spawn` (see `src-tauri/src/downloader/manager.rs`). Lesson: when a
  crash resists reproduction, check for `tokio::spawn`/`Handle::current()` calls reachable from a
  non-async command — the isolated-function test we wrote first didn't catch it because
  `#[tokio::test]` supplies its own runtime, masking the exact failure mode.

## Backlog

Status tags: `[done]` `[in-progress]` `[blocked: needs files]` `[blocked: needs decision]` `[idea: needs discussion]`

### Quick fixes
- [done] Settings panel slide-down animation + cramped title-bar padding
- [done] Scrollbar should stop under the window's close (X) button, not run flush beside it
- [done] Ambient background blobs should sway with scroll position, not just cursor
- [done] Title-bar brand dot should pulsate
- [done] Footer: "made with love"
- [done] Riot Client added to Gaming Applications
- [done] App's own icon should show in the built installer instead of the default Tauri icon
- [done] OS picker: replace the underline indicator with a full-section "lightswitch" highlight slide
- [done] README rewritten to be project-specific instead of the default Tauri template

### Medium features
- [done] "Downloaded" history box near the Open Downloads Folder button (persisted across
  restarts via `downloadHistoryStore`, localStorage-backed)
- [done] App row bios: each catalog entry now has a `bio` field (one-line description of the app
  itself) shown by default; a chevron toggle expands a per-row panel with a website link and the
  old verification `notes` text (moved out of the default view, since that was implementation
  detail, not a description of the app).
- [pending] Script generation: "Pin to Startup" action, greyed out until the script is actually
  generated. Plan: write a small `.bat` wrapper into the Windows Startup folder
  (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`) that calls
  `powershell -ExecutionPolicy Bypass -File "<absolute path>"`, checking the script file exists at
  pin-time. Known edge case (flagged by user): if the underlying script is later deleted, the
  startup entry silently no-ops at next login — Windows just skips a failed startup item, no
  crash, but no warning either. Not started.

### Big open discussions (see Decisions section)
- [done] Full layout revamp — replaced the single long top-to-bottom accordion scroll with a
  sidebar layout: `CategorySidebar` (category nav with per-category icon, live count, sticky
  position) + `CategoryPanel` (selected category's apps). Added a pinned "All" entry
  (`ALL_CATEGORY_ID` in `src/lib/constants.ts`) showing every category at once. Search now matches
  across all categories regardless of sidebar selection, grouped by category heading in the panel.
- [idea] Resolver for JS-rendered pages (Windscribe/TeamSpeak/PyCharm) — hidden webview vs.
  external resolver service (Raspberry Pi idea)
- [idea] Favicon quality — why some are missing/low-res, whether we can upscale/generate better ones
- [idea] Self-hosted personal content on user's Synology NAS, with optional per-category auth

### Blocked on user-provided files (do not build catalog/UI scaffolding until files + hosting are settled)
- [blocked: needs files+hosting] Cursor packs section — install via `install.inf`/`install.ini`
  cursor scheme file, show "Active" in green once applied
- [blocked: needs files+hosting] Fonts section, with preview
- [blocked: needs files+hosting] PeaceSetup.exe + a Sennheiser HD650 "Oratory" Peace EQ profile
- [blocked: needs files+hosting] Steam profile / workshop customization section, with preview
- [blocked: needs files+hosting] Windows system sounds section
- [blocked: needs files+hosting] Profile pictures / desktop wallpapers / banners section

## Decisions log

Append new entries at the top with a date. Keep each one short: what was decided, why, what it
rules out.

### 2026-07-08 — JS-rendered pages: prefer local-only (hidden WebView), not a networked helper
Revisited after asking "why not just run Selenium on the user's own machine instead of a Pi?" —
correct instinct, and it collapses into the hidden-webview plan rather than replacing it. Real
Selenium/WebDriver would require bundling a driver binary that has to version-match the user's
installed browser (e.g. `msedgedriver.exe` vs installed Edge) and drive it over the WebDriver wire
protocol. Tauri already embeds a real Chromium engine (WebView2 on Windows) for free — a
hidden/off-screen `WebviewWindow` gets the same result (run real JS, read the resolved link) with
zero extra binaries and zero network dependency, which is strictly better than both the driver-binary
approach and the Raspberry-Pi-service idea. Only reason to prefer a real, non-embedded browser: a
site actively fingerprints/blocks embedded or headless browsers. None of the three known JS-rendered
targets (Windscribe, TeamSpeak, PyCharm) do this — their download buttons are just client-rendered,
not adversarial — so the hidden-WebView plan stands as the primary approach. Not implemented yet.

### 2026-07-08 — Personal-content hosting: recommend Synology File Station shared links first
User has a Synology NAS and wants to host personal files (cursor packs, fonts, EQ profiles, Steam
profile assets, sounds, wallpapers) for close friends only, with optional per-category password
protection. Recommended starting point: Synology **File Station** shared links (per-folder or
per-file, each can have its own password and expiry via DSM's own UI) — zero custom server code,
matches "swiftly with ease." App would just do an authenticated HTTP GET. Fallback if more control
is needed later: Web Station + HTTP Basic Auth on specific directories, or a small Docker-hosted
API if per-category logic gets complex. Not yet implemented — waiting on the user to actually set
up sharing on their NAS and confirm URLs/auth scheme before any catalog entries reference it.

### 2026-07-08 — Resolver for JS-rendered pages: hidden webview, not Selenium/a bundled browser
Confirmed Selenium/Playwright absolutely *can* solve the JS-rendering problem technically — never
claimed otherwise. The reason it wasn't already built: bundling a Python+Selenium or
Node+Playwright runtime (plus a browser binary) into a lightweight Tauri desktop app is heavy
(100s of MB, a second language runtime) for a handful of catalog entries. Tauri already embeds a
real webview (WebView2 on Windows) for free — the planned approach is a hidden/off-screen
`WebviewWindow`, navigate it to the vendor page, extract the resolved link via an injected script
calling back into a Tauri command, close it. User's Raspberry-Pi-as-resolver-service idea (a small
Python/Selenium service on the Pi that the app calls over HTTP) is a legitimate alternative and
actually simpler to build than the hidden-webview approach — tradeoff is it only works while the
Pi is reachable on the network, which is fine for personal use but wouldn't generalize if this app
is ever shared with others. Not yet implemented either way — revisit once the personal-hosting
NAS work above is settled, since it's the same "network dependency" shape of problem.
