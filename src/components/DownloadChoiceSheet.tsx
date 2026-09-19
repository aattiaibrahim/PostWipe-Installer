import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import type { Os } from "../types/catalog";
import { DOWNLOADS_CATEGORY_ID } from "../lib/constants";
import { isTauri, startDownload } from "../lib/tauriCommands";
import { osPlatform } from "../lib/platform";
import { useCatalogStore } from "../state/catalogStore";
import { useInstallStore } from "../state/installStore";
import { installKind } from "../lib/installKind";

type Choice = "install" | "download";
const LAST_CHOICE_KEY = "postwipe-download-choice";

function lastChoice(): Choice {
  try {
    return localStorage.getItem(LAST_CHOICE_KEY) === "download" ? "download" : "install";
  } catch {
    return "install";
  }
}

interface ChoiceRequest {
  count: number;
  /** Picked apps that only have a click-through installer (downloaded, left for the user). */
  manual: string[];
  resolve: (c: Choice | null) => void;
}

interface ChoiceState {
  request: ChoiceRequest | null;
  ask: (count: number, manual: string[]) => Promise<Choice | null>;
}

const useDownloadChoice = create<ChoiceState>((set) => ({
  request: null,
  ask: (count, manual) => new Promise((resolve) => set({ request: { count, manual, resolve } })),
}));

/** Downloads several apps, asking first whether PostWipe should also install them all at once.
 *  That's Windows-only for now, so elsewhere it just downloads. Returns how many downloads
 *  started, or null if the sheet was dismissed. */
export async function downloadApps(ids: string[], os: Os): Promise<number | null> {
  if (ids.length === 0) return 0;
  // Only Windows installers, on a Windows PC (or the browser preview).
  const canInstall = os === "windows" && (osPlatform === "windows" || !isTauri);
  const catalogApps = new Map((useCatalogStore.getState().catalog?.categories ?? []).flatMap((c) => c.apps).map((a) => [a.id, a]));
  const manual = ids.flatMap((id) => {
    const app = catalogApps.get(id);
    return app && installKind(app, os) === "manual" ? [app.name] : [];
  });
  const choice = canInstall ? await useDownloadChoice.getState().ask(ids.length, manual) : "download";
  if (!choice) return null;
  try {
    localStorage.setItem(LAST_CHOICE_KEY, choice);
  } catch {
    // Remembering the choice is a convenience only.
  }
  const apps = new Map([...catalogApps].map(([id, a]) => [id, a.name]));
  const jobs: { jobId: string; appId: string; appName: string }[] = [];
  for (const id of ids) {
    try {
      const jobId = isTauri ? await startDownload(id, os) : `preview-${id}`;
      jobs.push({ jobId, appId: id, appName: apps.get(id) ?? id });
    } catch {
      // A failed start shows on that app's own row; keep queuing the rest.
    }
  }
  if (choice === "install" && jobs.length > 0) {
    useInstallStore.getState().begin(jobs);
    // The Downloads page shows the run from download to installed.
    useCatalogStore.getState().setSelectedCategory(DOWNLOADS_CATEGORY_ID);
  }
  return jobs.length;
}

/** The sheet itself, mounted once in App. */
export function DownloadChoiceSheet() {
  const request = useDownloadChoice((s) => s.request);
  // One run at a time: a second "install for me" while one is going would fight it for the
  // admin prompt and the installers' own locks.
  const busy = useInstallStore((s) => s.stage === "downloading" || s.stage === "installing");
  const preferred = busy ? "download" : request ? lastChoice() : "install";

  const answer = (c: Choice | null) => {
    request?.resolve(c);
    useDownloadChoice.setState({ request: null });
  };

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return createPortal(
    <AnimatePresence>
      {request && (
        <motion.div className="confirm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => answer(null)}>
          <motion.div
            className="confirm-dialog download-choice"
            role="dialog"
            aria-labelledby="download-choice-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
          >
            <h3 id="download-choice-title" className="confirm-dialog__title">
              Get {request.count} {request.count === 1 ? "app" : "apps"}
            </h3>
            <div className="download-choice__options">
              <button
                autoFocus={preferred === "install"}
                disabled={busy}
                className={`download-choice__option${preferred === "install" ? " download-choice__option--preferred" : ""}`}
                onClick={() => answer("install")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" />
                  <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                  <path d="m9 18 1.5 1.5L14 16" className="download-choice__check" />
                </svg>
                <span>
                  <strong>Install all at once</strong>
                  <span>
                    {busy
                      ? "Another install is still running. Try again when it finishes."
                      : "Installs everything quietly in the background: no clicking Next, no toolbars. Windows asks for admin once."}
                  </span>
                  {!busy && request.manual.length > 0 && (
                    <span className="download-choice__manual">
                      {request.manual.length === 1 ? `${request.manual[0]} only has` : `${request.manual.length} apps (${request.manual.slice(0, 3).join(", ")}${request.manual.length > 3 ? "…" : ""}) only have`}{" "}
                      {request.manual.length === 1 ? "its" : "their"} own installer, so {request.manual.length === 1 ? "it's" : "they're"} downloaded and listed for you to run.
                    </span>
                  )}
                </span>
              </button>
              <button
                autoFocus={preferred === "download"}
                className={`download-choice__option${preferred === "download" ? " download-choice__option--preferred" : ""}`}
                onClick={() => answer("download")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                </svg>
                <span>
                  <strong>Download only</strong>
                  <span>Saves each installer to PostWipeDownloads so you can install them yourself, one by one.</span>
                </span>
              </button>
            </div>
            <div className="confirm-dialog__actions">
              <button className="confirm-dialog__btn" onClick={() => answer(null)}>
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
