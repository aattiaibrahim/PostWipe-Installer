import { useCatalogStore } from "../state/catalogStore";
import { openDownloadsFolder } from "../lib/tauriCommands";
import { DownloadHistoryPanel } from "./DownloadHistoryPanel";

export function SearchFilterBar() {
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearchQuery = useCatalogStore((s) => s.setSearchQuery);
  const selectMode = useCatalogStore((s) => s.selectMode);
  const setSelectMode = useCatalogStore((s) => s.setSelectMode);

  return (
    // No framer `layout` here — as `flex: 1`, this grows/shrinks fluidly on its own while the
    // vendor toggle animates its width. `layout` would animate via a distorting scale transform.
    <div className="search-filter-bar">
      <input
        className="search-filter-bar__input"
        type="search"
        placeholder="Search apps..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {/* "Select Multiple Apps": while active, clicking anywhere on a row/card toggles its
          selection — no need to aim for the little checkbox. */}
      <button
        className={`search-filter-bar__folder-btn search-filter-bar__folder-btn--icon${selectMode ? " search-filter-bar__select-btn--on" : ""}`}
        onClick={() => setSelectMode(!selectMode)}
        aria-label={selectMode ? "Exit multi-select mode" : "Select multiple apps"}
        aria-pressed={selectMode}
        title={selectMode ? "Exit multi-select mode" : "Select multiple apps"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="6" height="6" rx="1.5" />
          <path d="m4.6 8 1.4 1.4L8.6 6.8" />
          <rect x="3" y="14" width="6" height="6" rx="1.5" />
          <path d="M13 7h8M13 11h5M13 16h8M13 20h5" />
        </svg>
      </button>
      <DownloadHistoryPanel />
      <button
        className="search-filter-bar__folder-btn search-filter-bar__folder-btn--icon"
        onClick={() => openDownloadsFolder()}
        aria-label="Open downloads folder"
        title="Open downloads folder"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      </button>
    </div>
  );
}
