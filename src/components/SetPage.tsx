import { useState } from "react";
import type { Catalog, Os } from "../types/catalog";
import { useAccountStore } from "../state/accountStore";
import { useCatalogStore } from "../state/catalogStore";
import { useSelectionStore } from "../state/selectionStore";
import { startDownload } from "../lib/tauriCommands";
import { FAVORITES_CATEGORY_ID } from "../lib/constants";
import { AppCard } from "./AppCard";
import { PublishVisibleSelectable } from "./SelectMode";

export const SET_CATEGORY_PREFIX = "set:";
export const setCategoryId = (setId: string) => `${SET_CATEGORY_PREFIX}${setId}`;

/** A saved set as its own page: the whole collection, restored in one click on a fresh wipe
 *  instead of re-picking apps one at a time. Sets sync with the account and remember their
 *  apps for BOTH platforms, so this shows whichever half matches the OS being browsed. */
export function SetPage({ catalog, os, setId }: { catalog: Catalog; os: Os; setId: string }) {
  const set = useAccountStore((s) => s.profile.sets.find((x) => x.id === setId));
  const deleteSet = useAccountStore((s) => s.deleteSet);
  const setCategory = useCatalogStore((s) => s.setSelectedCategory);
  const replaceSelection = useSelectionStore((s) => s.replace);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!set) return <p className="category-panel__empty">This set no longer exists.</p>;

  const byId = new Map(catalog.categories.flatMap((c) => c.apps).map((a) => [a.id, a]));
  const apps = (set.apps[os] ?? []).flatMap((id) => {
    const app = byId.get(id);
    return app && app.platforms[os] ? [app] : [];
  });
  const downloadable = apps.filter((a) => a.kind === "download" && !!a.platforms[os]?.resolver).map((a) => a.id);
  const otherOs: Os = os === "windows" ? "macos" : "windows";
  const otherCount = (set.apps[otherOs] ?? []).length;
  const osName = (o: Os) => (o === "windows" ? "Windows" : "macOS");

  async function downloadAll() {
    setStatus(`Starting ${downloadable.length} downloads…`);
    let started = 0;
    for (const id of downloadable) {
      try {
        await startDownload(id, os);
        started++;
      } catch {
        // Per-app failures show on their own rows.
      }
    }
    setStatus(`Queued ${started} of ${downloadable.length}. Follow them with the download button above.`);
  }

  return (
    <div className="category-panel">
      <PublishVisibleSelectable ids={downloadable.join(",")} />
      <button className="set-page__back" onClick={() => setCategory(FAVORITES_CATEGORY_ID)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Favorites
      </button>
      <header className="store-head set-page__head">
        <div>
          <h1 className="store-head__title">{set.name}</h1>
          <p className="store-head__sub">
            Set · {apps.length} {osName(os)} {apps.length === 1 ? "app" : "apps"}
            {otherCount ? ` · ${otherCount} for ${osName(otherOs)}` : ""} · synced to your account
          </p>
        </div>
        <div className="set-page__actions">
          <button className="settings-btn settings-btn--primary" disabled={!downloadable.length} onClick={() => void downloadAll()}>
            Download all {downloadable.length}
          </button>
          <button className="settings-btn" disabled={!downloadable.length} onClick={() => replaceSelection(downloadable)}>
            Choose…
          </button>
          {confirmDelete ? (
            <>
              <button
                className="settings-btn settings-btn--danger"
                onClick={() => {
                  deleteSet(set.id);
                  setCategory(FAVORITES_CATEGORY_ID);
                }}
              >
                Delete {set.name}
              </button>
              <button className="settings-btn" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="settings-btn" onClick={() => setConfirmDelete(true)}>
              Delete set
            </button>
          )}
        </div>
      </header>
      {status && <p className="set-page__status">{status}</p>}
      {apps.length === 0 ? (
        <p className="category-panel__empty">No {osName(os)} apps in this set.</p>
      ) : (
        <div className="category-panel__rows">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} os={os} />
          ))}
        </div>
      )}
    </div>
  );
}
