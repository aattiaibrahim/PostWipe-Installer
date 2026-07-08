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
  glob asset match), `html` (fetch + CSS selector via `scraper`), `webview` (hidden Tauri
  `WebviewWindow` for pages that genuinely need client-side JS to run before the link exists —
  see "JS-rendered pages" below; as of 2026-07-08, no catalog entry actually needs it, but it's
  kept for the next site that truly requires it). `html` sends a realistic desktop-browser
  `User-Agent` (`BROWSER_USER_AGENT` in `html_resolver.rs`) since some sites 403 reqwest's default
  UA. `html` and `webview` share `apply_base_and_regex` for the optional `base_url`/`url_regex`
  post-processing step.
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
- **JS-rendered pages — corrected 2026-07-08**: the `webview` resolver got built and shipped
  first, but real live-testing (once the user actually clicked Download and hit
  `no element matched selector 'a.windows-download'`) showed the earlier assumption was wrong for
  all three of the original targets:
  - **Windscribe**: `windscribe.com/download` really is JS-rendered (Next.js shell, no `.exe` in
    the raw HTML) — but `windscribe.com/install/desktop/<windows|macos>` is a stable, versionless
    redirect straight to the current installer, no JS needed at all. Back to `static`.
  - **PyCharm**: `jetbrains.com/pycharm/download` is JS-rendered, but JetBrains publishes a
    stable public API — `data.services.jetbrains.com/products/download?code=PCC&platform=<windows|mac>`
    (`PCC` = Community, the free edition) — that 302s straight to the current installer. Back to
    `static`.
  - **TeamSpeak**: `teamspeak.com/en/downloads` is **not actually JS-rendered** — the real
    download URL was in the static HTML all along, just on `<button data-url="...">` instead of
    `<a href="...">`, which is why the original `a.download-windows` selector never matched
    anything (wrong tag, wrong attribute, wrong class). Fixed by using the `html` resolver with
    selector `button[data-url*="TeamSpeak3-Client-win64"]` / `...macosx` and `attr: "data-url"`.
    Also needed the new browser `User-Agent` header above (teamspeak.com 403s reqwest's default one).

  All three are now verified live (see the `resolver::live_tests` module — `cargo test` actually
  hits the network and asserts on the real resolved URL) and no longer marked `stale`. **Lesson**:
  don't reach for the heaviest tool (hidden webview) on the strength of a stale assumption in old
  notes — check what a plain `curl` actually returns first. The `webview` resolver itself is still
  correct, tested infrastructure; it's just not needed by anything in the catalog right now.
- **Regression, same day**: this fix was written up above as done, but the actual `catalog.json`
  edit got silently discarded a few minutes later by a `git checkout -- catalog/catalog.json` used
  to undo an unrelated JSON-formatting mistake (a trailing comma while adding the placeholder
  categories). `git checkout` reverts the *whole file* to its last-committed state, including any
  other uncommitted changes sitting in it — it doesn't revert "just the mistake." The three apps
  silently went back to the broken `webview` spec, and the `cargo test` suite kept passing the
  whole time because `resolver::live_tests` calls the resolver functions directly with hardcoded
  specs, never actually reading `catalog.json` — so a green test suite gave false confidence that
  catalog data was fine. Caught only when the user hit the exact same "no element matched selector"
  error again. Re-applied the fix (this time verified with `diff` between `catalog/catalog.json`
  and `public/catalog.json` after editing, not just "did the edit tool report success"). **Lesson**:
  after any `git checkout`/`git restore` used as a fix-it-forward move, re-diff every file it
  touched against what you intended, especially ones with other in-flight uncommitted changes —
  and remember unit tests against hardcoded specs don't catch data-file regressions.
- The original Windscribe "crash" (2026-07-07) was **not** a resolver bug — it was
  `tokio::spawn` being called from a Tauri sync-command thread with no ambient Tokio runtime,
  which panicked across a WebView2 FFI boundary and hard-aborted the process. Fixed by switching
  to `tauri::async_runtime::spawn` (see `src-tauri/src/downloader/manager.rs`). Lesson: when a
  crash resists reproduction, check for `tokio::spawn`/`Handle::current()` calls reachable from a
  non-async command — the isolated-function test we wrote first didn't catch it because
  `#[tokio::test]` supplies its own runtime, masking the exact failure mode.

## Backlog

Status tags: `[done]` `[in-progress]` `[blocked: needs files]` `[blocked: needs decision]` `[idea: needs discussion]`

### Quick fixes (2026-07-08, third pass)
- [done] Re-fixed the Windscribe/PyCharm/TeamSpeak resolvers after the regression documented in
  Known Issues above wiped the catalog.json changes. Verified this time via `diff` between
  `catalog/catalog.json` and `public/catalog.json`, plus a full `cargo test` run, before moving on.
- [done] "Pin to Startup" not working: the Rust write/read/delete logic itself was already correct
  (proved with a new test — `commands::scripts::tests::pin_then_unpin_round_trips_on_the_real_startup_folder`
  — that exercises the *real* Windows Startup folder on the dev machine, not a temp dir). The real
  gap: the button only ever unlocked after clicking "Generate Script" again in the *current*
  session, even if the script was already generated and sitting in Downloads from a previous
  session — looked exactly like "nothing happens" if you opened the app fresh and went straight
  for Pin. Added `find_generated_script` (Rust) / `findGeneratedScript` (TS), checked on mount
  alongside the existing pinned-state check, so an already-generated script is picked up
  immediately without regenerating.
- [done] Color palette redesign around user-supplied brand colors (`#1a2ffb` accent / `#f0f1fa`
  light background), inspired by lusion.co. Removed `--accent-2` and every flat-UI two-tone
  gradient (title text, brand dot, OS-picker indicator, sidebar active state, download-history
  badge, progress bar) in favor of solid `--accent` — gradients now only appear on the ambient
  background blobs, and those got a large opacity cut (0.85/0.55 → 0.4/0.22) for a cleaner, less
  "candy" look. Dark mode got a matching near-black blue-tinted background (`#0b0c16`).
- [idea, not done] Lusion's actual display font is "Aeonik," a paid commercial typeface (CoType
  Foundry) — confirmed by fetching their CSS `@font-face` rules, not guessed. Did **not** copy the
  font files from their site (that would be redistributing a license we don't have). Kept Inter
  for now; a free visually-similar alternative (e.g. Fontshare's "General Sans" or "Cabinet
  Grotesk") would be the legitimate path if the user wants that specific geometric-grotesk look.

### Quick fixes (2026-07-08, second pass)
- [done] Wargaming Game Center: `wgc.wargaming.net` didn't resolve at all (dead DNS, not just
  the wrong app) — switched to `redirect.wargaming.net`'s stable NA-region install redirect,
  verified live end-to-end. No longer `stale`.
- [done] Removed `authors = ["..."]` from `src-tauri/Cargo.toml` (was the only place a personal
  name appeared in the repo). Commit messages already never referenced it.
- [done] Legibility pass: `--text-muted` darkened/lightened per theme for more contrast, surface
  backgrounds bumped from ~0.55-0.6 opacity to 0.82 (steadier contrast against blob colors showing
  through), base font-size 15px → 16px, app row bio text 0.75rem → 0.85rem.
- [done] Expand-toggle chevron switched from a sharp Unicode triangle (▸) to a stroke-based
  rounded SVG chevron (`stroke-linecap/linejoin: round`), matching the rest of the icon set.
- [done] Sidebar categories color-coded: `src/lib/categoryColors.ts` maps each category id to a
  color, used to tint the icon (inactive state) and the active-state background via a
  `--cat-color` CSS custom property set inline per item (flat color as of the third pass below,
  not a gradient). "All" has no override, keeps the accent color.
- [done] Ambient blobs now hue-shift continuously (`@keyframes blob-hue-cycle`, 30s linear loop,
  staggered `animation-delay` per blob so they don't move in lockstep) — "rainbow" background.
- [done] Footer/UI stutter during window resize: backdrop-filter blur (used almost everywhere via
  `--glass-blur`) and the new animated blob hue-rotate are expensive to repaint on every frame of
  a live resize, which is why the footer visibly lagged behind. `useResizeGlitchGuard` toggles an
  `.is-resizing` class on `<html>` during the resize (200ms debounce after the last event) that
  zeroes `--glass-blur` and drops blob blur/pauses the hue animation for that window, restoring
  full quality once resizing settles.

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
- [done] Script generation: "Pin to Startup" action (`src-tauri/src/commands/scripts.rs`:
  `is_script_pinned`/`pin_script_to_startup`/`unpin_script_from_startup`). Writes a `.bat` wrapper
  into the Windows Startup folder that calls
  `powershell -ExecutionPolicy Bypass -File "<absolute path>"`. Button is greyed out until the
  script has been generated this session; re-checks the script file still exists on disk at
  pin-time and fails with a clear error if it was deleted (the known edge case flagged earlier) —
  it does not silently pin a broken shortcut. Toggles to a green "✓ Pinned" state; pin state is
  re-checked from disk on mount so it survives app restarts. The user's "nothing happens after I
  generate" report traced to a UI-feedback problem, not a broken command: success was only a small
  line of text easy to miss, not a functional bug — see the per-row status redesign below, which
  fixes the discoverability rather than any actual logic in `generate_script`/`pin_script_to_startup`.
- [done] Per-row download/script status moved from a separate global `DownloadQueuePanel` (now
  deleted, fully redundant) to inline UI next to each app's own action button:
  `.app-row__action-col` holds the button row (Pin button if a script, action/Cancel button, a
  green ✓ once complete) with a status area below it (progress bar while downloading, error
  message, or "Reveal in folder" once done). Downloads can now be cancelled inline per-row too.
- [done] System-tweak scripts (`RestartAudioService.ps1`, `KillValorantProcess.ps1`) now
  self-elevate: each starts with a check for
  `[Security.Principal.WindowsBuiltInRole]::Administrator` and re-launches itself via
  `Start-Process -Verb RunAs` (triggering a UAC prompt) if not already elevated. Needed since
  restarting a service / force-killing a Vanguard-protected process both require admin rights.
  Applies regardless of how the script is invoked (double-click, Pin to Startup, or manually).
- [done, placeholder] Six personal-content categories added to the catalog with one example entry
  each (`kind: "placeholder"`, new `AppKind` variant) so the user can preview the sidebar/layout
  before sending real files: Cursor Packs, Fonts, Audio & EQ Profiles, Steam Profiles, Windows
  Sounds, Wallpapers & Profile Pics. Each placeholder renders a disabled "Coming soon" button, no
  verified/stale badge, no resolver. **Not the real feature** — no install.ini cursor activation,
  no font previews, no Steam/wallpaper preview thumbnails yet; those need the actual files and the
  NAS hosting decision (see Decisions log) before they can be built for real. Delete the example
  entries once real per-category content design starts.

### Big open discussions (see Decisions section)
- [done] Full layout revamp — replaced the single long top-to-bottom accordion scroll with a
  sidebar layout: `CategorySidebar` (category nav with per-category icon, live count, sticky
  position) + `CategoryPanel` (selected category's apps). Added a pinned "All" entry
  (`ALL_CATEGORY_ID` in `src/lib/constants.ts`) showing every category at once. Search now matches
  across all categories regardless of sidebar selection, grouped by category heading in the panel.
- [done, live-verified] Resolver for JS-rendered pages — built the `webview` resolver first, then
  live-testing showed none of the three original targets actually needed it (see Known Issues
  above for what each one really needed instead). The `webview` resolver itself stays in the
  codebase for a genuine future case.
- [idea] Favicon quality — why some are missing/low-res, whether we can upscale/generate better ones
- [idea] Self-hosted personal content on user's Synology NAS, with optional per-category auth

### Blocked on user-provided files
A one-entry placeholder now exists for each of these (see "Medium features" above) purely so the
user can preview the sidebar/layout. The *real* per-category behavior below is still blocked.
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
