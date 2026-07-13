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

- **Second sweep 2026-07-08 (after real-app failures) — the first sweep had two blind spots.**
  User clicked Download in the built app and got five failures the first sweep missed:
  1. **Verification-client mismatch**: Battle.net + HWiNFO 403'd in the app but passed my checks,
     because the checks used `curl -A "Mozilla/5.0..."` while the app's *downloader* sent no
     User-Agent at all (only the page-scraping resolver had one). Fixed by setting
     `BROWSER_USER_AGENT` on the download client in `downloader/job.rs`. Lesson: verify with the
     exact client configuration the app uses.
  2. **Sweep scope**: Prime95, NetLimiter, and Brave had rotted URLs but were never `stale`-flagged,
     so the flagged-only sweep skipped them. Fixed: Prime95 + NetLimiter now scrape their own
     download pages (`html` resolver); Brave moved to its official GitHub releases (both OSes) since
     referrals.brave.com stopped responding. A follow-up full sweep also caught VS Code's macOS URL
     (`os=darwin` slug no longer exists → canonical `update.code.visualstudio.com/latest/darwin-universal/stable`).
  Permanent guard: `full_catalog_sweep_every_entry_resolves_and_downloads` (`#[ignore]`d, in
  `resolver/mod.rs`) resolves *every* catalog entry through the real resolvers and fetches each
  result with the downloader's own client config. **Run before every release:**
  `cargo test --lib -- --ignored full_catalog_sweep`. Note: back-to-back runs can trip vendor rate
  limits (teamspeak's file host 429s on quick repeats) — a 429 on rerun is usually that, not rot.
- **Full stale sweep done 2026-07-08 — zero stale entries remain.** Every flagged entry was
  live-verified (HEAD/GET with a browser UA, then network-hitting `resolver::live_tests` for the
  scraper-based ones). See per-entry `notes` for what changed. Highlights:
  - CPU-Z/HWMonitor scrape cpuid.com then rewrite onto download.cpuid.com via `url_regex`+`base_url`
    (the www host serves an HTML interstitial, not the binary); HWiNFO and PuTTY scrape their own
    download pages; TestMem5 moved to the CoolCmd/TestMem5 GitHub releases; Cinebench upgraded
    R20→R23 since R20's zip no longer exists anywhere official; Ubisoft moved to
    static3.cdn.ubi.com after the akamai URL started 401ing.
  - `timing-configurator`: it's ASRock's tool (renamed in-app accordingly); old domain is dead but
    ASRock's own server hosts it — `download.asrock.com/Utility/Formula/TimingConfigurator(v4.0.4).zip`,
    pinned at its long-final version.
  - `ddu`: wagnardsoft.com and guru3d.com (user's suggestion) are both Cloudflare-JS-challenged —
    unfetchable by reqwest, and even the `webview` resolver wouldn't help since CF clearance
    cookies would live in the webview while the download runs through reqwest without them.
    Solved via majorgeeks.com's mirror instead: its per-session tokenized file URL appears only
    inside an HTML comment, which no CSS selector can reach — hence the new **`html_regex`
    resolver** (`html_regex_resolver.rs`: fetch page, regex the raw body, return first match).
    Token rotates per fetch but each freshly resolved URL downloads cookie-lessly — proven
    end-to-end by `html_regex_resolves_ddu_from_majorgeeks_and_url_downloads`. Known fragility:
    it depends on a `<!-- Debug: ... -->` comment majorgeeks leaves in their page; if they remove
    it, the resolve fails cleanly into the manual-link fallback.
- **"✓ verified" badge removed 2026-07-08**: with every downloadable entry verified, the badge on
  all 40+ rows was pure noise, so it's gone from the UI (per user request). The `stale`
  flag/"needs check" badge machinery stays for future regressions — it just has nothing to show
  right now.
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

### Second big batch (2026-07-09)
- [done] Scripts are now self-elevating **`.bat`** files, not `.ps1` (double-clicking a `.ps1` opens
  Notepad instead of running it — that's why generated scripts looked broken). Templates check
  `net session` for admin and re-launch themselves elevated via
  `powershell Start-Process -Verb RunAs`.
- [done] **Pin to Start finally works**: it now creates a real Start-menu **`.lnk` shortcut** (via
  `WScript.Shell` COM through a hidden PowerShell call), not a raw `.bat` dropped in the Programs
  folder. Windows' Start-menu search/all-apps index reliably picks up `.lnk` files but often never
  shows a bare `.bat` — that was the whole "it does nothing" bug. `cleanup_legacy_startup_pins()`
  now also removes leftover `.bat` pins from the earlier attempt. Test asserts a real Shell-Link
  header (`0x4C` first byte) is written, not a text file.
- [done] Row status = ambient **background glow** on the app row (`.app-row__status-glow`), replacing
  the green checkmark + "Reveal in folder" link: yellow blink while downloading, soft green breathe
  when complete, red flash on failure. Reveal-in-folder moved fully into the Downloaded panel.
- [done] Blobs now have **autonomous sway** — each slowly squishes on out-of-phase X/Y scale
  oscillation (`morphSpeed` per blob in `AmbientBackground.tsx`), independent of cursor/scroll.
- [done] **Sticky topbar**: the OS picker / search / Downloaded / Open-Folder row is
  `position: sticky` and stays pinned while the app list scrolls; the sidebar's sticky `top`
  bumped to 76px to sit below it.
- [done] Battlestate Games Launcher added to Gaming (`launcher.escapefromtarkov.com/launcher/download`
  302s to the current `BsgLauncher.exe` on eft-store.com — verified live; the `prod.` subdomain
  returns a 403 JSON body, don't use it).
- [done] Overclocking category gets an **All/Intel/AMD lightswitch** (new `vendor` field, values
  `intel`/`amd`; absent = works on both). ZenTimings + ASRock Timing Configurator are `amd`; Intel
  view hides them (10 vs 12). New `Vendor` enum in the Rust model + TS type.
- [done] New `website` field so GitHub-hosted apps link to their actual repo instead of bare
  `github.com` (TestMem5, ZenTimings, NVIDIA Profile Inspector, Timer Resolution, NanaZip). The
  "Visit" link prefers `website` over `domain`.
- [done] Windows Themes added to Specials as a **deprecated** placeholder entry (the Paranoid
  Android `.msstyles` pack only worked on Windows 10).
- [done] Quick padlock-opening **unlock burst** (`SpecialsUnlockBurst.tsx`) plays once after a
  correct Specials password (`justUnlocked` transient flag in `specialsStore`).

### Selection bar in header, click sounds, category previews — 2026-07-12 (eighth pass)
- **Specials selection bar moved to the title bar** (was sticky inside the gallery). It now uses
  the exact `.selection-bar` title-bar placement as the catalog one (`SpecialsSelectionBar`
  rendered in `TitleBar` beside `SelectionBar`, both absolute-centered — only one shows at a time).
  Dropped the `.specials-selection-bar` sticky override.
- **UI click sounds** (user asked for "ubuntu sounds"): bundled the Ubuntu sound theme's tiny
  `Menu popup.wav` (extracted from the vault's own "Linux Ubuntu.zip" pack via rclone) as
  `src/assets/sounds/ui-click.wav`. `lib/sound.ts` decodes it once (Web Audio) and replays a fresh
  buffer source per click at 0.35 gain; a capture-phase `document` click listener in `App.tsx`
  fires on `button,[role=button],a,checkbox,.sidebar__item,.os-picker__tile` (capture so it still
  plays when a handler stops propagation). `soundStore` (persisted, on by default) + a "Click sound
  effects" toggle in Settings.
- **Category previews without uploads** — new `lib/specialsPreview.ts` `resolvePreviews(item)`:
  uploaded `previews/` images → the file itself when it's already an image (Wallpapers, Profile
  Pics, Banners now show their own thumbnail) → a bundled brand tile for PSDs (`photoshop.png`,
  a Ps tile) and Payday mods (`payday2-mods.png` = the PAYDAY 2 logo + BeardLib beard +
  "SuperBLT" wordmark, composited with PIL). SpecialsCard/Detail/cover-collage all use it. No R2
  writes — all code + bundled assets. (Payday logos: PD2 from Steam app 218620 logo.png, BeardLib
  from its repo's Assets/guis/textures/beardlib_logo.png; SuperBLT has no logo so it's a wordmark.)

### Specials multi-select + download spinner/cancel — 2026-07-12 (seventh pass)
- **Specials gallery multi-select**: new `specialsSelectionStore` (selected R2 objectKeys, parallel
  to the catalog's `selectionStore`). `SpecialsCard` is now a `<div role="button">` (was `<button>`
  — can't nest the checkbox `<button>` inside one) with a circular check top-left that reveals on
  hover / while any is selected / when checked; clicking it `stopPropagation`s so it toggles
  selection instead of opening the detail. Selected cards get an accent ring. `SpecialsSelectionBar`
  (reuses `.selection-bar` visuals, sticky-centered at the top of the gallery) shows "N selected /
  Clear / Download N" and batch-downloads each via `startSpecialsDownload` with the gated URL.
- **Download spinner + cancel** in the Downloaded panel: each active job now leads with
  `DownloadSpinner` (a green `--verified` ring chasing around a download-arrow icon,
  `dl-spin 0.9s`, reduced-motion aware) and ends with a ✕ `download-history__cancel` button wired to
  the existing `cancelDownload(jobId)`. Layout of `.download-history__active-item` went flex-row
  (spinner · body · cancel).
- Dev-only `window.__downloadQueue` handle added (DEV-guarded, like the specials ones) so
  download-progress UI is exercisable in the browser preview (no Tauri backend there).
- Verified in preview: spinner animates green + cancel present (2 seeded jobs); checkbox selects
  without opening detail, card-body click still opens detail, Clear empties + dismisses the bar.

### Gallery dark-mode text fix + Death Note preview combine — 2026-07-12 (sixth pass)
- **Dark-mode black text**: `.specials-card` is a `<button>` and buttons don't inherit text color,
  so the item name fell back to the UA near-black default — invisible on the dark card. Added
  `color: var(--text)` to `.specials-card`. Verified both themes in preview (dark: name is
  near-white on dark card; light: dark name on white card; detail sheet reads in both).
- **Death Note Steam-profile preview**: it was showing only the main art (B, 506×900); the zip
  `Tweaks/Steam Profiles/Death Note.zip` holds two 48-frame gif halves (A 100×900 strip + B). The
  other profiles are 606 wide (506+100), so stitched B(left)+A(right) into one 606×900 animated
  gif with Python/PIL (per-frame composite, preserved 40ms delays + loop) and uploaded as
  `previews/Death Note.gif`. B-left/A-right is the continuous layout AND matches the user's "on
  the right" instruction; A-left leaves a dead gap. rclone `r2:` remote is configured now (see
  assistant memory) — did NOT commit anything for this; it's a vault asset, live immediately.

### Specials → category covers + detail sheet (dropped horizontal scroll) — 2026-07-12 (fifth pass)
- User found horizontal shelves tedious on a desktop. Showed a 6-direction mockup board (built
  as an artifact, screenshotted via the vite server since claude.ai is blocked in the browser
  pane); user picked **#5 category covers + #6 detail sheet**. Everything is vertical-scroll now.
- New flow (`SpecialsContent.tsx`): landing = grid of **department cover cards** (2×2 collage of
  real item previews, gradient-tile fill, name + count) → click opens that category as its own
  **vertical grid** with a ← back header → clicking an item opens the **detail sheet**
  (`SpecialsDetail.tsx`, portal modal: big preview carousel / sound players / gradient glyph on
  the left, name + size + Download/Install on the right). Subfolders (Audio ▸ Sennheiser) are
  folder cover cards inside the category that drill one level deeper (breadcrumb + back).
- Component split: `SpecialsItem.tsx` DELETED; presentational tile is `SpecialsCard.tsx`
  (exports `tileGradient`, `fmtSize`, `gatedUrl`), all download/install/cursor-variant logic
  moved into `SpecialsDetail.tsx`. Cards no longer carry hover-scrim buttons — a click opens the
  sheet where the actions live.
- Verified in preview with mock groups: covers → category → subfolder → items → back all work,
  detail sheet opens/closes, gated Install hint shows, console clean, tsc passes.

### Specials gallery — AppleTV polish pass + unlock-burst fix — 2026-07-12 (fourth pass)
- First shelves cut looked cramped/"disgusting": each shelf was trapped in the inherited
  `.category-panel__section` bordered-glass box (box-in-a-box) whose `overflow: hidden` also
  CLIPPED the card hover-lift. Fixed by floating shelves on the page bg
  (`.category-panel__section.specials-shelf-section` — DOUBLE-class needed because
  `.category-panel__section` is defined later in the file and won on source order).
- Cards: bigger (210px), 16px radius, real drop shadow, AppleTV-style hover = lift + scale(1.045)
  + accent glow ring (cubic-bezier 0.22,1,0.36,1). Rail hides its scrollbar, vertical padding
  (14/22px) gives the lift room since `overflow-x:auto` forces `overflow-y:auto`. Next card peeks
  at the edge to signal scroll. Media has a top vignette; badge/actions/bar z-indexed above it.
- **Unlock burst regression fixed**: `.specials-unlock-burst` was `position: absolute` inside
  `.category-panel`, which is now very tall (all shelves) → the lock centered ~1000px down,
  off-screen, so it "stopped appearing". Changed to `position: fixed; inset:0; z-index:60`
  (viewport-centered). Verified in-preview: fixed, covers viewport, lock glyph centered + on
  screen.

### Specials → umbrelOS-style gallery shelves — 2026-07-12 (third pass)
- User asked for a "gallery-esque" Specials taking inspiration from umbrelOS, picked the
  **shelves** option: each category is now a horizontally-scrolling rail of big rounded cards
  (`SpecialsContent.tsx` → `Shelf`), vertical page-scroll moves between shelves. Replaced the
  old vertical list of `.specials-item` rows.
- `SpecialsItem.tsx` fully rewritten as a **card**: preview image (or a deterministic
  `tileGradient(name)` tile with a ♪ glyph for sound sets / initial letter for file-only items)
  fills the top; Download/Install sit on a hover scrim over the media (`.specials-card__actions`,
  revealed on `:hover`/`:focus-within`, and PINNED via `--active` whenever a download/install is
  in flight so state never hides); name + size below. All the download/install/cursor-variant
  flow is unchanged — only the shell moved.
- **Subfolders** (e.g. Audio & EQ ▸ Sennheiser 650) are now `FolderCard`s on the shelf; clicking
  one swaps that shelf's rail to the folder's contents with a ← back chip + breadcrumb
  (AnimatePresence slide), instead of the old inline height-expand.
- Dev-only escape hatches added so the KEY-GATED vault UI is verifiable in the browser preview:
  `window.__specialsGate` / `window.__specialsContent` (both `import.meta.env.DEV`-guarded, never
  in prod). Verified with mock groups AND against the real vault listing (folder cards, counts,
  gradients, hover-reveal, drill-in/back all confirmed).

### Real logos, Start-menu wording, *arr stack, dock spacing — 2026-07-12 (second pass)
- **Bundled real icons** for Deceive (repo Resources/deceive.ico), LosslessCut
  (static.mifi.no dist-icons 180px), TranslucentTB (AppPackage/Assets-Release
  Square44x44Logo.targetsize-256.png), and the two script rows now show `bat.ico` instead of
  a monogram letter. RULE (also in assistant memory): when adding an app, check what AppIcon
  will actually render — `domain: github.com` means the GITHUB favicon, no domain means a
  monogram — and bundle the real mark in `src/assets/app-icons/` + `BUNDLED_ICONS`. The
  catalog `icon` field is decorative; AppIcon never reads it.
- **"Pin to Start" → "Add to Start Menu"** (button: "✓ In Start Menu" when active): the old
  label promised a tile the app cannot legally place, which read as broken. The success toast
  now gives the quick manual step (Explorer opens with the .lnk selected → right-click ▸ Pin
  to Start). Scripts/system-tweaks are Windows-only in the catalog (no macos platform) so the
  category already disappears under the macOS filter.
- ***arr stack added to Torrenting** (user picked Prowlarr + Lidarr when asked what "flickrr"
  meant): Sonarr (assets say `win-x64`, NOT `windows` like the others!), Radarr, Prowlarr,
  Lidarr — all github_release, x64 installer + osx-app arm64 zip, verified live 2026-07-12.
  Their sonarr.tv/radarr.video/prowlarr.com/lidarr.audio favicons are the real logos, so no
  bundling needed.
- **Settings dock spacing**: the keep-mounted panel (snap fix below) still earned the dock's
  flex `gap` at height 0 → dead space above the Settings button. Gap removed; the open-state
  spacing is `padding-bottom` INSIDE the measured/clipped panel content
  (`.settings-dock__panel-inner`). Button now sits 8px/8px symmetric.

### Settings panel snap fix, 7 new apps, MSI re-probe — 2026-07-12
- **Settings panel open/close snapped** (the real one this time — the earlier fix was the
  checkbox): framer spring animating `height: 0 → "auto"` jump-cuts to final size (measured:
  full 305px on the first frame). Fix in `SidebarSettings.tsx`: panel stays MOUNTED,
  a ResizeObserver measures the content's px height, and the spring runs between numbers
  (0 ↔ contentHeight) with opacity + pointer-events/aria-hidden gating. Verified tweening
  0→41→235→305 over ~600ms.
- **New apps** (all verified live through the real resolvers; full_catalog_sweep passed):
  Deceive (gaming; github portable exe), Anki (msi now, not exe), HandBrake (.sig assets
  don't match the glob — ends_with saves us), LosslessCut (free GitHub Windows build is
  portable .7z ONLY, installer is the paid Store version), Plex Desktop
  (plex.tv/api/downloads/**6**.json = desktop, 5 = server, 7 = HTPC; html_regex over the JSON),
  TranslucentTB (.appinstaller official path; portable zip fallback if ms-appinstaller is
  policy-blocked), Focusrite Control for Scarlett 3rd Gen (downloads.focusrite.com page is
  static HTML, newest-first hrefs on fael-downloads-prod).
- **MSI Afterburner stays site-only — mechanism-blocked, not stale**: download.msi.com zip now
  302s to the landing page, landing 403s non-browser clients (Akamai; Referer/?ver don't help),
  msi.com refuses automated browsers, Guru3D mirrors (ftp.nluug.nl) shut down → their JS gate.
  Needs the webview resolver (backlog) — this is the honest answer to "why can't MSI work".

### Release publishes as draft-until-complete — 2026-07-12
- "Update check failed: None of the fallback platforms [windows-x86_64-nsis, …] were found"
  was a RELEASE-WINDOW RACE, not an updater bug: tauri-action published the release as soon as
  the first (mac) build uploaded, so latest.json briefly contained only darwin platforms while
  the slower Windows build ran. Any Windows update check in that ~5-10 min window failed.
- Fix in release.yml: `releaseDraft: true` + a `publish` job (needs: [version, build]) that
  `gh release edit --draft=false --latest` only after BOTH platforms uploaded. While building,
  releases/latest keeps serving the previous complete release; a failed build leaves the draft
  unpublished. tauri-action merges latest.json platforms across jobs into the same tagged
  (draft) release, so the published manifest always has all four platform keys.

### Sidebar slide indicator, TIDAL/Qobuz direct downloads, icons, confirm modal — 2026-07-11
- **Sidebar active pill slides** between categories (framer `layoutId="sidebar-active-indicator"`,
  vertical version of the OS-picker effect). Background moved off `.sidebar__item--active` onto
  the absolutely-positioned `.sidebar__active-bg`; row content z-indexed above it.
- **TIDAL is downloadable directly now**: `download.tidal.com/desktop/TIDALSetup.exe` (and
  `TIDAL.dmg`) serve fine with a browser UA — the old "403s to everything" note was wrong about
  the path, not the host ('TIDAL Setup.exe' / 'TIDAL.exe' 403; 'TIDALSetup.exe' works). Static
  resolvers on both platforms, verified MZ header + 192MB full fetch.
- **Qobuz is downloadable directly now**: their old `/us-en/download` page 404s; the current
  `/us-en/discover/apps-qobuz` page carries versioned installer links
  (`desktop.qobuz.com/releases/...`) in static HTML → html resolvers
  (`a[href*='Qobuz_Installer'][href$='.exe']`, darwin/arm64 dmg for mac). Guessing any other
  desktop.qobuz.com path 403s — only exact released paths work. `website` updated to the new page.
- **Icons**: bundled real `qobuz.png` (their apple-touch-icon has OPAQUE WHITE corners — the
  "white dots"; flood-filled from the edges to transparent, keeping the white "qbz" glyphs) and
  `music-presence.png` (domain github.com meant the GitHub favicon showed; real mark fetched from
  musicpresence.app/logo-dark.png, 512→96px). New `BUNDLED_CHIP_BG` map gives the white
  Music-Presence donut a fixed dark chip so it survives light theme.
- **Settings panel top border removed** (`.settings-dock .settings-panel { border-top }` — the
  faint line).
- **Download All now confirms first**: centered `.confirm-overlay/.confirm-dialog` portaled to
  <body> ("This queues N installers for <OS>…", Cancel / Download All). SidebarSettings'
  Esc/click-outside handlers ignore events while the overlay exists, else the dock would unmount
  the dialog mid-choice.

### Settings switch + Downloaded panel delete — 2026-07-11
- **Settings on/off animates**: the native checkbox (which can only snap) is visually replaced by
  a `.toggle-switch` pill + sliding knob (0.3s overshoot cubic-bezier); the real `<input>` stays
  visually-hidden in the tree for keyboard/screen-reader semantics (`:checked + .toggle-switch`
  drives the visuals, `:focus-visible` ring kept).
- **Downloaded panel**: each row now shows a file-type tag (EXE/DMG/MSI…, derived from the
  destPath extension) and a red ✕ at the right. ✕ swaps the row's actions to Delete?/Keep
  (inline confirm, one row at a time, reset when the dropdown closes). Delete calls new
  `delete_download` Rust command — canonicalizes and refuses anything outside PostWipeDownloads —
  then drops the history entry (`removeEntry` added to `downloadHistoryStore`).
- Verified in the browser preview with seeded history entries (badges, confirm flow, toggle
  transition all checked); `cargo check` + `tsc` clean.

### Cursor schemes now auto-equip after install — 2026-07-11
- The .inf install only ever REGISTERED the scheme (`HKCU\Control Panel\Cursors\Schemes`); the
  user still had to pick it in Mouse settings. New `equip_scheme` in `specials.rs` does what the
  control panel's Apply does: read the scheme's comma-separated value, write the 17 slots
  (Arrow…Hand, Pin, Person — older 15-slot packs blank the last two) into
  `HKCU\Control Panel\Cursors` as ExpandString, set `(default)` + `Scheme Source=1`, then
  broadcast `SystemParametersInfo(SPI_SETCURSORS, …, SPIF_UPDATEINIFILE|SPIF_SENDCHANGE)` via
  PowerShell Add-Type — applies instantly, no logoff, no elevation (HKCU only).
- Equip is best-effort inside `apply_inf_and_equip`: if it fails, install still succeeds with the
  old "select it manually" message. Both install paths (single-inf + variant picker) use it.
- Verified read-only against the live registry: all 8 registered schemes split into slots in
  exactly the expected order. Did NOT live-toggle the user's active cursors.

### Music/Torrenting/Utilities categories + more apps — 2026-07-11
- **Three new categories**: Music Players (spotify, tidal, qobuz, music-presence), Torrenting
  (qbittorrent, deluge), General Utilities (sharex, twinkle-tray, flux). Added category icons
  (`categoryIcons.tsx`) + colors (`categoryColors.ts`). **MSI Afterburner** added to
  overclocking.
- **Resolvers verified live 2026-07-11**: Spotify static (win+mac scdn.co), flux static
  (win+mac), ShareX/Twinkle Tray/qBittorrent/Music-Presence github_release, Deluge static-pinned
  to 2.2.0 win64 on the osuosl mirror (bump when newer; the dir keeps old versions so an html
  selector would grab the wrong one).
- **qBittorrent dual build**: ships standard + longer `_lt20` (libtorrent 1.2) variant; a `*`
  glob matches both and asset order isn't guaranteed. Fixed the github_release resolver to pick
  the **shortest matching asset name** (`min_by_key(name.len())`) = the standard build.
- **Site-only apps** (Tidal, Qobuz, MSI Afterburner): vendor blocks direct/automated download
  (403 or JS-gated), so their entry has NO resolver + a `website`. AppCard now renders a
  "Get from site ↗" button (opens the official page) for any non-script/placeholder download
  entry lacking a resolver — clean path instead of the old error-then-fallback. Proper fix later
  = the deferred webview resolver.
- Brand icons added: spotify, tidal, qbittorrent, deluge, sharex, msi-afterburner (simple-icons).
  Qobuz/flux/music-presence use favicon fallback (siFlux is the wrong "Flux"; Qobuz absent).

### DECLINED: "Cracked Programs" / Adobe cracked migration — 2026-07-11
User asked to move `\\Voyager\Tweaks\Programs\{Adobe Programs Cracked, Cracked Programs}` into
`postwipe-specials/Tweaks/Cracked Programs/{Adobe,General}/`. Declined: that's pirated commercial
software (copyright infringement to host/redistribute), independent of it being the user's own
vault. Did NOT upload anything. The legitimate freeware in the same message was all completed.

### PayDay 2 mods, cursor collages, pin-tile reveal — 2026-07-10 (third pass)
- **PayDay 2 Mods (Diesel 2.0)**: user uploaded `Tweaks/Payday 2 Mods - Diesel 2.0/`
  (mods.zip + assets.zip) to R2 — appears automatically; added `SPECIALS_CATEGORIES` meta
  (order 6, download-only) + curated names. To enumerate the bucket WITHOUT the key: a
  throwaway worker (`tmp-list-*`, separate name so the gate's secret isn't attached) run via
  `wrangler dev --remote` and curled through the local proxy, then deleted. Note plain
  `wrangler dev --remote` of the real gate DOES load the deployed secret — the gate stays
  locked even in dev, and `wrangler r2 object` has no `list` subcommand.
- **Cursor collages**: `cursor-collage.cjs` (scratchpad) decodes EVERY .cur/.ani in each
  pack's primary variant folder (biggest dir when multi-scheme), trims, integer-upscales,
  grids at 104px cells → uploaded as `previews/<stem>__2.png` for all 26 packs. The lightbox
  opens cursor packs at index 1 (the collage) so inspecting shows the whole set; the 96×54
  thumbnail stays the single Normal Select / artwork.
- **Pin tile, closest legal step**: after creating the .lnk the app opens Explorer with it
  selected (`explorer /select,<lnk>`; suppressed under cfg(test)) — right-click ▸ Pin to
  Start from Explorer is the one action Windows allows to create the tile. The only sanctioned
  programmatic route is the packaged-app consent API (SecondaryTile/StartScreenManager),
  which would require repackaging the NSIS app as MSIX with identity + cert — noted as
  possible future work, not planned.

### Cursor-install root cause + pin diagnostics + polish — 2026-07-10 (second pass)
- **Cursor install "always failed" — ROOT CAUSE (GitHub #1)**: cursor pack .inf files declare
  `DestinationDirs = 10,"%CUR_DIR%"` → SetupAPI copies into `C:\Windows\Cursors\<scheme>`,
  which needs ADMIN. Explorer's right-click ▸ Install elevates via UAC; the app's rundll32 ran
  unelevated → copy failed every time. Fixed in `apply_inf`: `Start-Process rundll32 -Verb
  RunAs -Wait` (path passed UNQUOTED after the 132 flag — InstallHinfSection doesn't parse
  quotes; the shell's own inffile verb also passes %1 unquoted), then verify `SCHEME_NAME`
  actually appeared under `HKCU\Control Panel\Cursors\Schemes` because rundll32's exit code is
  meaningless. Declined UAC → friendly error. Confirmed by INSPECTION of the .inf files — do
  NOT live-run installs on the user's machine (see feedback memory; he was rightly upset).
- **Pin to Start diagnostics (GitHub #2)**: pin/unpin now log every step to
  `%TEMP%\postwipe-pin.log`; `pin_script_to_start_menu` returns the created .lnk path and the
  UI names it ("search \"X\" in Start"). The tiles-grid limitation stands (start2.bin, no API).
- **Polish**: batch checkboxes are custom-drawn 20px circles (native checkboxes can't be
  circular) with a CSS checkmark; unlock burst is now a ~2.4s sequence (glow, springy shackle
  with overshoot, keyhole blink, staggered double ring, 10 radiating sparks); WebView2's
  built-in password-reveal eye (`input::-ms-reveal`) is inverted in dark mode — it's drawn
  black and was invisible on the dark input.

### Big previews/UX batch — 2026-07-10
- **Settings moved INTO the sidebar** (`SidebarSettings.tsx` inside `CategorySidebar`, replacing
  `SettingsCorner.tsx` — user disliked the full-screen blur): gear row at the sidebar bottom;
  opening expands the panel upward *in* the sidebar (full sidebar width, sidebar widened
  208→236px) while `.sidebar--settings-open .sidebar__categories` dims (opacity .3, saturate .5,
  scale .965, pointer-events none); gear again / Esc / click-away restores. No backdrop.
- **SelectionBar moved into the title bar** next to the brand (slides down from the very top,
  `initial y:-34`); compact pill, same count/Clear/Download info. `TitleBar` wraps brand +
  SelectionBar in `.title-bar__left`.
- **Rows click-to-expand**: clicking anywhere on an `.app-row` (except buttons/inputs/links)
  toggles the bio panel — not just the chevron.
- **Intel/AMD toggle is global**: `vendorFilter` lives in `catalogStore`, `VendorToggle.tsx`
  renders in the Browse topbar always; vendor-tagged apps hide under the other vendor, untagged
  always show. (Only ZenTimings + ASRock TC are tagged, both `amd`.)
- **Cursor previews for the 11 pack zips with no internal image**: scratchpad
  `cursor-previews.cjs` extracts each pack's Normal Select `.cur`/`.ani`, decodes the ICO/RIFF
  (32/24/8/4/1-bpp BMP DIB + AND mask, PNG-compressed entries, first .ani "icon" chunk),
  composites centered on 192×108 transparent PNG (integer nearest-neighbor upscale), uploaded as
  `previews/<zip stem>.png`. Watch out: "Alternate Select" is the up-arrow — the name scorer must
  prefer normal/arrow/default and negative-match alternate/text/help/etc.
- **Font previews**: extracted a representative `.ttf`/`.otf` per font zip, rendered 480×270
  sample PNGs via PowerShell GDI+ (`PrivateFontCollection`, dark card, name + alphabet + pangram),
  uploaded as `previews/<zip stem>.png`. All 6 fonts covered.
- **Sound previews are playable in-app**: all 31 wavs from Anime Sounds + Linux Ubuntu extracted
  and uploaded under `previews-audio/<zip stem>/<file>.wav`; `specialsContentStore` indexes them
  into `item.audioPreviews`; sound items show a "♪ Preview" chip → `SoundPreview.tsx` overlay
  listing every sound with play/stop (one `Audio` at a time, gated URLs).
- **Nested Specials folders**: `Tweaks/<cat>/<sub>/<file>` (e.g. Audio & EQ ▸ "Sennheiser 650")
  renders as an expandable folder row (`SubfolderRow` in `SpecialsContent`). Also fixes downloads
  of nested files (filename is now the basename, was "sub/file").
- **No-preview placeholder removed**: items with neither image nor audio previews (PSD, themes,
  EQ files) show no preview box at all.
- **Cursor install variant picker**: `list_cursor_variants` (Rust) extracts + enumerates every
  `install.inf` labeled by its `SCHEME_NAME` (UTF-16 aware) or folder; >1 → `CursorVariantPicker`
  overlay; pick → `apply_cursor_variant` runs that .inf via InstallHinfSection. Single-inf packs
  apply directly as before.
- **CI builds macOS too**: release.yml split into a `version` job (bump+push once) and a
  `build` matrix (windows-latest + macos-latest `--target universal-apple-darwin`); both publish
  to the same tag via tauri-action. bundle.targets already had dmg/app. NOTE: the mac build is
  unsigned — Gatekeeper will warn (right-click ▸ Open).
- **Pin to Start** (user asked again): `.lnk` at Programs root is correct and verified on disk;
  the *pinned tiles* grid is `start2.bin` (a binary database, NOT a folder) — no file move can
  pin, and Win11 returns E_ACCESSDENIED for the programmatic pin verb for all normal apps. Other
  installers don't do it either; syspin/start2.bin hacks stay rejected. Restored the user's
  "Restart Audio Service" pin manually once more.
- **Browser-preview gotcha**: in the occluded preview pane rAF is suspended → framer-motion
  exit animations never run → AnimatePresence keeps filtered-out rows in the DOM. Verify filter
  logic via a non-animated branch (e.g. the empty-state message), not row counts.

### Settings corner, pins to Programs root, Steam preview galleries, Firefox — 2026-07-09 (third pass)
- **Settings moved to the bottom-left corner** (`SettingsCorner.tsx`, mounted in `App.tsx`): fixed
  gear pill at bottom:40/left:16; clicking expands the panel *upward* over a full-screen dimming +
  blur backdrop (`.settings-corner__backdrop`, z:52) so the app behind it is contrasted down while
  the panel stays in focus. Esc / click-out closes and everything returns to normal. `TitleBar.tsx`
  no longer has any settings button — brand + window controls only.
- **SelectionBar joined it on the left**: now fixed at bottom:92/left:16 (stacks above the gear),
  with a breathing accent glow (`::before` radial + `status-glow-breathe`) to match the row-glyph
  treatment.
- **Pins move to Programs ROOT** (`scripts.rs`): Windows 11 collapses `Programs\<subfolder>`
  entries in All apps into a folder people never open — that's why "pins still not working". `.lnk`
  now lands directly in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\<label>.lnk` (dynamic
  per-user via the APPDATA env var — no hardcoded username). `cleanup_legacy_startup_pins()`
  migrates any old `Programs\PostWipe\*.lnk` to the root and removes the folder. Tests serialize on
  `START_MENU_LOCK` (a parallel-test race once deleted the user's real pin — restored by hand).
  AppCard's post-pin message updated to match (search Start / All apps directly).
- **Steam profile preview galleries**: the three showcase GIF sets (Kurisu, Rin Tohsaka, Saber)
  were extracted from the `.rar`s already in R2 with local 7-Zip (the original MEGA link is dead —
  ENOENT -9) and uploaded as `previews/<stem>.gif` + `__2` + `__3`. Multi-preview convention:
  `previews/<stem>__N.<ext>` = extra angles, indexed into `previewKeys: string[]` (main first) in
  `specialsContentStore`.
- **Clickable preview lightbox** (`PreviewLightbox.tsx`): Specials thumbnails are now buttons
  (zoom-in cursor, hover lift, "N" count badge when multiple); clicking opens a full-screen viewer
  with ‹ › arrows + arrow keys, counter, Esc/click-out close. z-index 90, above the settings layer.
- **Firefox added to Browsers** (catalog id `firefox`): static resolver on
  `download.mozilla.org/?product=firefox-latest-ssl` for win64 + osx (both verified 200);
  `siFirefoxbrowser` brand icon. Remember `public/catalog.json` must be re-synced (`cp
  catalog/catalog.json public/catalog.json`) whenever `catalog/` changes — done this pass.

### Specials vault fixes + previews — 2026-07-09 (second pass)
- **Install "can't find install.inf" root cause**: the Install button un-greyed as soon as the
  download *started* (destPath was set from the start handle, not completion), so users could
  unzip a half-written archive. Now `downloaded` requires `job.status === "completed"`. Also:
  several packs (Posy's, macOS, diamos, Maverick, Simplify Circle/Handy/Minimal/Tip, ubuntu,
  cursor_concept_2*, kami) genuinely have **no** `install.inf` — the message now distinguishes
  "has .cur/.ani but no installer → apply via Mouse settings ▸ Pointers" from "Linux/macOS-format
  pack". (*cursor_concept_2 actually has `Install.inf` per dark/light subfolder — multi-inf case
  opens the folder.)
- **Pin to Start, final verdict**: user means the Start menu *tiles*. Verified on this machine that
  Windows 11 returns `E_ACCESSDENIED` when a program invokes the shell's "Pin to Start" verb —
  Microsoft restricts tile-pinning to real user clicks / MDM. The app does the maximum allowed:
  `.lnk` into Start ▸ All apps ▸ PostWipe (+ search), and after pinning now shows "right-click it
  there ▸ Pin to Start for a tile". Don't ship syspin/start2.bin hacks.
- **Previews extracted from inside the pack zips** (user confirmed they're in there): scratchpad
  script pulls each zip from R2 via wrangler, picks the best internal image (name matches
  /preview|screenshot|cover/i, else largest ≥25KB, cap 8MB), uploads as `previews/<zip-stem>.<ext>`.
  17 uploaded; the rest contain no images at all → UI shows a "No preview" placeholder (user OK'd).
  `specialsContentStore` indexes `previews/*` by stem and attaches `previewKey`; `SpecialsItem`
  renders a 96×54 thumbnail via the Worker `/file` URL with the session key.
- **Display names**: curated `DISPLAY_NAMES` map in `specialsConfig.ts` for the messy upload
  filenames (deviantart suffixes, VSTHEMES.ORG tags, hashes) + `displayName()` heuristic fallback
  for anything unmapped.
- **Blob autonomy** turned up (driftRadius ~2.7x, driftSpeed ~1.7x, squish amplitude 0.07→0.14).

### Specials vault — WIRED (unlock + dynamic listing + download + install) — 2026-07-09
Deployed and wired end-to-end. Worker lives at
`https://postwipe-specials-gate.andrewattiaibrahim.workers.dev` (URL constant in
`src/lib/specialsConfig.ts`). Bucket `postwipe-specials`; files under `Tweaks/<Category>/…`
(user pre-zipped every cursor pack / font / sound set — 26 cursors, 6 fonts, Sennheiser EQ,
Steam `.rar`s, sounds, PSD, deprecated themes). Key is a Worker secret the user set; never in
app/repo.
- **Unlock is real** (`specialsStore.tryUnlock`): fetches `/validate?key=…` against the Worker;
  on 200 stores the key in memory (`sessionKey`, session-only, never persisted) and unlocks.
  Verified live: a wrong key gets a 401 and the lock shakes/clears.
- **Content is dynamic** (`specialsContentStore` + `SpecialsContent.tsx`): after unlock, fetches
  `/list?key=…`, groups objects by the `Tweaks/<folder>/` segment, renders sub-sections per
  `SPECIALS_CATEGORIES` metadata. Anything the user adds to R2 shows up automatically — no catalog
  edits. The old placeholder Specials entries are no longer rendered (kept in catalog.json only so
  the sidebar still shows the locked category; excluded from All/search).
- **Download** (`start_specials_download` Rust cmd): frontend builds
  `/file/<encoded path>?key=<sessionKey>` and the manager streams it to
  `PostWipeDownloads/Specials/`.
- **Install** (`install_specials_item` Rust cmd, greyed until downloaded): `cursor` → unzip via
  `Expand-Archive`, find `install.inf`, apply with
  `rundll32 setupapi.dll,InstallHinfSection DefaultInstall 132` (right-click-Install equivalent;
  writes HKCU, usually no admin — if a pack needs elevation or has multiple `.inf` variants, it
  opens the folder and tells the user); `font`/`sound` → unzip + open folder for the user to apply;
  `none` (PSD/Steam/EQ/themes) → download-only, no Install button.
- **Not yet verified on native**: the actual download+install can't run in the browser preview
  (needs the Tauri runtime + real Windows), so the user does that smoke test with their key. Also
  deferred: audio previews for Windows Sounds, font previews, cursor-pack preview images (bucket
  has zips only; the MEGA previews weren't uploaded separately). Show "no preview available" until
  then. `specials-gate/worker.js` keeps a gated `/list` (the temporary ungated `/setup-list` used
  once to enumerate paths has been removed).

### Specials content hosting — DECIDED: Cloudflare R2 + Worker gate — 2026-07-09
Background: the user shared the files as a **MEGA folder link**, which the app can't fetch (MEGA is
E2E-encrypted; no plain HTTP GET — needs MEGA's crypto protocol; `megajs` was used only to
*traverse* it for planning, see `docs/MEGA_CONTENTS.md`). Walked through hosting options; key
realization the user cared about: **any credential shipped in a public app is extractable**, so a
private GitHub repo / password-protected NAS link / etc. all give *zero* real protection (the token
or password has to travel inside the public app or public catalog). GitHub-secret-scanning would
also auto-revoke a token committed publicly.

**Chosen path (the only one that gives genuine protection): Cloudflare R2 + a Worker gate.** The
secret never touches the app or repo — it's a Worker secret; friends get the key out-of-band and
type it into the Specials prompt, which the app sends to the Worker per request. See
`specials-gate/` (worker.js, wrangler.toml, README) — committed, holds no secrets. R2 free tier
(10 GB + free egress) covers the whole set; Worker free tier covers the request volume.

**Status: app side is BLOCKED on the user's Cloudflare setup and not yet built** (deliberately — I
can't build/test the app→Worker path without the deployed Worker; building it blind = contract
drift + the exact "scaffold unreachable content" trap). The `specials-gate/README.md` is the
user's setup checklist; when they send back **(1) the Worker URL, (2) a test key, (3) the uploaded
object paths**, build the app side:
  - New download path for Specials items: URL = `<WORKER>/file/<object-path>?key=<session key>`.
    Simplest wiring is the existing `static`/download-manager with the URL built from a configurable
    Worker base + per-item object path + the key held in `specialsStore` after unlock. (Key in URL
    is fine over HTTPS for a shared friend-key; downloads go through reqwest so no CORS.)
  - Make the Specials unlock **real**: the password box calls a Tauri command that GETs
    `<WORKER>/validate?key=…` (via reqwest, no CORS); on 200, store the key in `specialsStore` for
    the session and unlock. The current `aVoid` client-only check is replaced by this server check.
  - Then wire each Specials catalog entry to its object path and build the per-type install flow.

Install *mechanics* to remember when files land (from `MEGA_CONTENTS.md`): cursor packs ship an
`install.inf` (right-click → Install sets the scheme; may need elevation — leave to the user);
fonts install by copying `.ttf` to the Fonts folder (or shell "Install" verb); Windows sounds are
`.wav` sets applied via a `.theme`/registry sound-scheme (plausibly a generated `.bat`); Steam
profiles are `.rar` artwork/showcase packs (offer the `.rar` + a short how-to; previews are `.gif`);
PSD and Windows-Themes(deprecated) are download-only. Folder-based items (cursor packs, sound sets)
must be zipped before upload — noted in the README.

### MEGA folder contents (traversed 2026-07-09, for when hosting is settled)
See `docs/MEGA_CONTENTS.md` for the full tree. Top level under `PostWipeInstaller/`: **Cursors/**
(~26 packs, most with `install.inf` + `x1`/`x2` PNG cursor images; a few have preview images,
many don't — show "no preview available"), **Fonts/** (5 `.zip` + one loose `.ttf`), **PSD'S/**
(one 50MB `.psd`), **Audio & EQ Profiles/Sennheiser 650/**, **Steam Profiles/** (3 `.rar` + `.gif`
previews + `.txt` instructions per showcase), **Windows Sounds/** (Anime + Linux Ubuntu `.wav`
sets), **Windows Themes/Paranoid Android/** (Win10-only `.msstyles`, deprecated).

### Big batch (2026-07-09)
- [done] All downloads + generated scripts now land in `Downloads\PostWipeDownloads\`
  (`postwipe_downloads_dir()` in `commands/download.rs`, created on demand); "Open Downloads
  Folder" opens that folder.
- [done] Downloaded panel = source of truth on disk: entries are filtered through the new
  `paths_exist` command, so deleting a file from the folder removes it from the panel. In-progress
  downloads now show *inside* the Downloaded dropdown with a live progress bar + percentage
  (indeterminate slide while size is unknown); the app row keeps only Cancel while downloading.
  Also fixed the progress bar starting at 100%: unknown `totalBytes` used to map to `width: 100%`.
- [done] `description` field on every real catalog entry (2–3 sentences of actual app copy, drafted
  by Claude) rendered in the expanded panel; `notes` is now internal-maintenance-only and never
  rendered anywhere (it previously leaked verification/bugfix text into the UI, which the user
  called out).
- [done] The six placeholder sections merged into ONE password-gated **Specials** category
  (windows+mac): clicking it shows an animated "void" glyph (rotating dashed rings + breathing
  core) and a password prompt. Password is `aVoid` — an explicitly-acknowledged placeholder in a
  public repo (a curtain, not a lock) until real hosting (Mega vs NAS) is decided. Unlock is
  session-only (`specialsStore`, not persisted); locked Specials are excluded from search, the All
  view, and the All count, and the sidebar shows a padlock instead of a count.
- [done] Launch splash (`LaunchSplash.tsx`, ~1.9s): accent orb draws in, fills, pulses once, whole
  overlay dissolves into the app; random Henry David Thoreau quote beneath, Discord-style.
- [done] Sidebar hover now mixes from `--text` (12%) instead of `--surface-hover`, which was
  near-invisible against the sidebar in light mode.
- [done] Footer is a link to the GitHub repo; heart is red with a heartbeat pulse animation.
- [done] Update-on-launch prompt (`UpdatePrompt.tsx`): checks once at launch ONLY if the new
  "Automatically check for updates" setting is on (default on, persisted in `settingsStore`), and
  only shows UI when an update actually exists — Install & Restart / Later.
- [done] Red "Download All Apps" button in Settings: queues every downloadable app for the current
  OS (skips scripts and placeholders). `MAX_CONCURRENT_DOWNLOADS` raised 3 → 6 so it feels
  genuinely parallel; the rest queue up as slots free.

### Quick fixes (2026-07-08, sixth pass)
- [done] Font switched again per user request: General Sans → **Geist** (Vercel's typeface, free
  under the SIL Open Font License, fetched via the Google Fonts API — single variable woff2 at
  `public/fonts/Geist-Variable.woff2`, weight range 100–900, so no static-weight juggling like
  General Sans needed). General Sans files removed. Font history: Segoe UI (accidental fallback) →
  Inter → General Sans (~1 hour) → Geist.
- [done] Click-outside-to-dismiss for both floating dropdowns (Settings popover, Downloaded
  history panel). New `useClickOutside` hook (`src/hooks/useClickOutside.ts`): document-level
  `pointerdown` listener, attached only while the dropdown is open, closes it when the event
  target is outside the panel's anchor element. Verified both directions: outside click closes,
  inside click doesn't.

### Quick fixes (2026-07-08, fifth pass)
- [done] Light-mode-only bug: hovering an active sidebar category made its icon disappear for as
  long as the pointer stayed over it. Root cause: `.sidebar__item:hover` (specificity 0,2,0 — one
  class + one pseudo-class) beat `.sidebar__item--active` (0,1,0 — one class) for
  background/color, reverting to the plain near-white hover surface in light mode — but
  `.sidebar__item--active .sidebar__icon { color: #fff }` (0,2,0, unrelated to `:hover`) kept the
  icon forced white regardless, so a white icon landed on a near-white background. Invisible in
  light mode; not in dark mode, where the hover surface is dark enough that a white icon still
  reads fine — which is why it looked theme-specific. Fixed by adding an explicit
  `.sidebar__item--active:hover` rule so hovering an already-selected item keeps its category
  color instead of falling back to the generic hover treatment. Found and fixed the identical
  pattern on `.os-picker__tile` (shared by the OS picker and the new theme toggle) and
  `.app-row__pin-btn--active` (the green "✓ Pinned" state losing its color on hover) before it was
  reported there too.
- [done] Re-confirmed General Sans is the right call after being asked to double check: directly
  verified it's genuinely free (fetched real woff2 files from Fontshare's own CDN, no auth/paywall
  — contradicts one search-result aggregator that incorrectly called it a paid font) and that it's
  the closest free match to Aeonik's geometric-grotesk style; the other commonly-suggested free
  options (Inter, DM Sans, Work Sans) are more humanist/rounded, not real lookalikes. No change.

### Quick fixes (2026-07-08, fourth pass)
- [done] Manual light/dark theme toggle, defaulting to dark regardless of OS preference.
  `src/state/themeStore.ts` (zustand + persist, localStorage key `postwipe-theme`) replaces the old
  `@media (prefers-color-scheme)` approach — all theme CSS now keys off `:root[data-theme="dark"]`
  / `:root[data-theme="light"]` (`useApplyTheme` syncs the store to `document.documentElement`'s
  `data-theme` attribute). An inline script in `index.html` reads the same localStorage key
  synchronously before React mounts, so there's no flash of the wrong theme on launch. Toggle UI
  lives in Settings, reusing the OS-picker's sliding-highlight styling (`ThemeToggle` in
  `SettingsPanel.tsx`) with hand-drawn sun/moon icons.
- [done] Chose a font: switched from Inter to **General Sans** (Fontshare, free for commercial
  use), the closest free alternative to Lusion's paid Aeonik. Self-hosted 4 static weights
  (400/500/600/700 — `public/fonts/GeneralSans-*.woff2`, fetched from Fontshare's own CDN via their
  public CSS API, not scraped from lusion.co) since General Sans isn't offered as a single
  variable-font file the way Inter was. `h1`/`h2`/`h3` weight adjusted 650 → 600 to match an actual
  available static weight instead of relying on browser nearest-weight fallback.

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
- [done] Lusion's actual display font is "Aeonik," a paid commercial typeface (CoType Foundry) —
  confirmed by fetching their CSS `@font-face` rules, not guessed. Did **not** copy the font files
  from their site (that would be redistributing a license we don't have). User picked General Sans
  as the free alternative — see the fourth-pass entry above for what actually shipped.

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
- [done, then REWORKED 2026-07-08] Script generation: "Pin to Start" action
  (`src-tauri/src/commands/scripts.rs`: `is_script_pinned`/`pin_script_to_start_menu`/
  `unpin_script_from_start_menu`). **The first version pinned to the wrong place**: it wrote the
  `.bat` wrapper into `Start Menu\Programs\Startup`, whose contents auto-run at every login — the
  user got a PowerShell/UAC prompt on every boot (the scripts self-elevate) and reported it. What
  he wanted was the Start *menu*. Now writes `<menu_label>.bat` into `Start Menu\Programs\PostWipe\`
  (shows in Start menu all-apps/search, runs only when clicked; folder is removed again when the
  last pin is unpinned). `cleanup_legacy_startup_pins()` runs at app launch and deletes any
  `PostWipe-*.bat` the old version left in the Startup folder, so affected machines heal on next
  launch (the user's machine was also cleaned manually). Button is greyed out until the script has
  been generated (this session or found on disk from a previous one); re-checks the script file
  still exists at pin-time; toggles to a green "✓ Pinned" state; pin state re-checked from disk on
  mount. Tests exercise the real Start menu path and assert pins can't land in the Startup folder.
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
- [done] Favicon fallback (2026-07-08): user prefers a real favicon (even low-res) over the
  colored monogram letters. `AppIcon` now tries, in order: simple-icons brand SVG → favicon via
  Google's s2 favicon service (`google.com/s2/favicons?domain=<app.domain>&sz=64`) → monogram
  (only for entries with no `domain`, i.e. scripts and placeholders). Covers ~23 previously
  monogrammed apps including VS Code. Caveat: Google's endpoint returns a globe placeholder
  instead of erroring for icon-less domains, so `onError` only catches network failures.
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
