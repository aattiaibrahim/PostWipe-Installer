import type { AppEntry, Os } from "../types/catalog";

/** How "Install all at once" treats an app, mirroring `mode_for` in commands/install.rs:
 *  - "silent": installs in the background with no windows;
 *  - "manual": only has its own click-through wizard, so it's downloaded and left for you;
 *  - "portable": nothing to install, the download is the app;
 *  - null: not something Install all at once handles (macOS, bookmarks, scripts). */
export type InstallKind = "silent" | "manual" | "portable" | null;

export function installKind(app: AppEntry, os: Os): InstallKind {
  if (os !== "windows" || app.kind !== "download") return null;
  const platform = app.platforms.windows;
  if (!platform?.resolver) return null;
  const ext = (platform.filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "msi") return "silent";
  if (ext === "exe") {
    if (platform.install?.portable) return "portable";
    return platform.install?.args?.length ? "silent" : "manual";
  }
  if (ext === "msix" || ext === "msixbundle" || ext === "appinstaller") return "manual";
  return "portable";
}
