import { useCatalogStore } from "../state/catalogStore";
import { openDownloadsFolder } from "../lib/tauriCommands";
import { DownloadHistoryPanel } from "./DownloadHistoryPanel";

export function SearchFilterBar() {
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearchQuery = useCatalogStore((s) => s.setSearchQuery);

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
