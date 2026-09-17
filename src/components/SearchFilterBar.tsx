import { useCatalogStore } from "../state/catalogStore";
import { openDownloadsFolder } from "../lib/tauriCommands";
import { DownloadHistoryPanel } from "./DownloadHistoryPanel";

/** Search, at the top of the sidebar column — where the App Store keeps it. */
export function SearchField() {
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearchQuery = useCatalogStore((s) => s.setSearchQuery);

  return (
    <label className="gg-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        placeholder="Search"
        aria-label="Search apps"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </label>
  );
}

/** Right-hand group of the toolbar: download history and the downloads folder. */
export function ToolbarActions() {
  return (
    <div className="gg-toolbar__actions">
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
