# PostWipe Installer

A desktop app for quickly reinstalling your everyday software after a fresh Windows or macOS
wipe — pick your OS, browse categorized apps (games, dev tools, browsers, overclocking utilities,
and more), and download what you need with real progress tracking. Built with Tauri, React, and
Rust.

## Features

- **Curated, categorized catalog** — Gaming Applications, Overclocking & Benchmarking, File
  Compressors, Security & Privacy, Dev Tools, Browsers, Social & Communication, and System
  Tweaks/Scripts, all defined in a single data file (`catalog/catalog.json`) rather than hardcoded.
- **Live URL resolution** — most links resolve automatically via GitHub's release API or a direct
  static URL; a handful of pages that only reveal their download link via client-side JavaScript
  are flagged, with a one-click fallback to the app's real download page.
- **Concurrent downloads** with real progress, cancel, and atomic writes (no corrupted partial
  files if you cancel mid-download).
- **System tweak scripts** — one-click generation of small utility scripts (e.g. restart the
  audio service, kill a stuck process) written straight to your Downloads folder.
- **Self-updating** — checks for and installs new versions from Settings.

## Tech stack

- [Tauri](https://tauri.app/) (Rust backend, native window)
- React + TypeScript + Vite (frontend)
- [framer-motion](https://www.framer.com/motion/) for animation
- [simple-icons](https://simpleicons.org/) for brand logos

## Development

Requires Node.js and the Rust toolchain (`rustup`), plus the platform prerequisites listed in the
[Tauri docs](https://tauri.app/start/prerequisites/) (on Windows, the MSVC C++ Build Tools).

```bash
npm install
npm run tauri dev
```

To produce a real installer:

```bash
npm run tauri build
```

## Project structure

- `catalog/catalog.json` — the app catalog (categories → apps → per-OS resolver spec). Adding or
  fixing an app is a data edit here, not a code change. See `catalog/catalog.schema.json` for the
  shape.
- `src-tauri/src/resolver/` — the three resolver types: `static` (direct URL), `github_release`
  (GitHub API + asset pattern match), and `html` (fetch + CSS selector).
- `src-tauri/src/downloader/` — the concurrent download manager.
- `src/` — the React frontend.
- `docs/PROJECT_NOTES.md` — architecture notes, known issues, and the active feature backlog.

## Releases

Every push to `master` is automatically built, signed, and published as a new GitHub Release via
GitHub Actions (see `.github/workflows/release.yml`), including the manifest the in-app updater
uses to check for new versions.
