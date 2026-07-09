# Specials source files — MEGA folder inventory

Traversed 2026-07-09 from `mega.nz/folder/wqgRgKhB#…` (folder key in the shared link) with the
`megajs` Node library. **These files are not yet reachable by the app** — see the "BLOCKER —
Specials content hosting" note in `PROJECT_NOTES.md`. This is a planning inventory only.

## Cursors/ (~26 packs)
Each pack is a themed cursor set. Almost all contain an **`install.inf`** (right-click → Install
applies the scheme; may prompt for elevation) plus `x1/` and `x2/` folders of PNG cursor frames
(and often `.cur`/`.ani` or `.cursor` config files). Preview images exist for *some* packs (e.g.
the `Cursors & Preview/` subfolders on the `vs_cursor_*` packs) but many have **no preview** — UI
should show "no preview available" for those.

Packs seen: capitaine_cursors, vs_cursor (v8/v11/v12), crystal-clear v4.1, Night Diamond v3.0 (8
color variants, each with its own `[XX] (Installer).inf`), Maverick Rounded (Light/Dark),
Simplify family (Tip / Minimal / Circle / Handy / Dot 2 / Pointy — each Light/Dark or color
variants), vision_cursor (Black/White), cursor_sans_family, nero-cybercyan, DIM v4 TechnoBlue,
ubuntu human cursors, cursor_concept_2, Chroma (black/white, sizes M/L/XL), windows_11_fluent v3,
macOS, diamos-pack, Posy's Cursor Mono Black, kami v2 Jet Black. (There's also a nested duplicate
`Cursors/Cursors/` mirroring the same packs — dedupe when importing.)

## Fonts/
Loose archives: `gotham-black-font.zip`, `Bonbon-Font.zip`, `Metropolis-Black.zip`, `keep_calm.zip`,
`Mononoki.zip` (7.4MB), plus `komika_axis/KOMIKAX_.ttf` (+ its `Komika.txt`). Install = unzip and
drop the `.ttf`/`.otf` into the Fonts folder (or shell "Install" verb). Previews: render each font
name in its own face once the `.ttf` is available.

## PSD'S/
`Exclusive Layer Styles Pack By Visual.psd` (49.7MB) — single file, download-only button.

## Audio & EQ Profiles/
`Sennheiser 650/` — Peace/EqualizerAPO parametric EQ profile for the Sennheiser HD 650 (the
"Oratory" preset). PeaceSetup + the `.peace`/config file.

## Steam Profiles/
Three finished showcases as `.rar` (offer the `.rar` directly — it's what makes it "professional"):
`Final Delivery Kurisu Steins Gate.rar` (12.8MB), `Final Delivery Saber.rar` (13.2MB),
`Final Delivery Rin Tohsaka.rar` (12.4MB), plus `Steam Artwork Design Beginning Girl 2.zip`.
Each showcase folder has `.gif` previews (Preview/Middle/Right) and some `.txt` instructions
(screenshot vs artwork showcase). Also `Death Note/` and `Jujutsu Kaisen [Workshop Showcase]/`
(gif previews + a `Read.txt`). → previews = the `.gif`s, tutorial = the `.txt`.

## Windows Sounds/
- `Anime Sounds/` — `touko_*.wav` set (17 files: default beep, min/max, exclamation, asterisk,
  device connect/disconnect, critical stop, low/critical battery, UAC, new mail, etc.).
- `Linux Ubuntu/` — Ubuntu sound set (Balloon, Disconnect, Default, Connect, login/logout,
  startup 1.3MB, shutdown, error, question, Exclamation, etc.).
→ preview = play each `.wav`; install = apply as a Windows sound scheme (likely a generated `.bat`
that writes the `HKCU\AppEvents\Schemes` registry entries + copies the wavs; user finishes any
elevation).

## Windows Themes/  (DEPRECATED — Windows 10 only)
`Paranoid Android/` — Dark Mode + Pure Dark variants, each with `.theme` files and a
`Paranoid Android/` subfolder of `.msstyles` (Nebula/Sweet/lace/SweetSpot, ~1.1–1.2MB each) plus a
patched `Shell/NormalColor/shellstyle.dll`. These target the Win10 theme engine and don't apply on
Windows 11 — listed as a deprecated placeholder, not installable.
