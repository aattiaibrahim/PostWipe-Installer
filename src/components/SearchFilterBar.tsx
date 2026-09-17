import { useCatalogStore } from "../state/catalogStore";
import { DownloadsButton } from "./DownloadsButton";

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

/** Right-hand group of the toolbar: the shortcut to the Downloads page (which has its own
 *  "Open folder" button, so the toolbar no longer needs one). */
export function ToolbarActions() {
  return (
    <div className="gg-toolbar__actions">
      <DownloadsButton />
    </div>
  );
}
