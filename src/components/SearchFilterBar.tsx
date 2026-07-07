import { useCatalogStore } from "../state/catalogStore";
import { openDownloadsFolder } from "../lib/tauriCommands";

export function SearchFilterBar() {
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearchQuery = useCatalogStore((s) => s.setSearchQuery);

  return (
    <div className="search-filter-bar">
      <input
        className="search-filter-bar__input"
        type="search"
        placeholder="Search apps..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <button className="search-filter-bar__folder-btn" onClick={() => openDownloadsFolder()}>
        Open Downloads Folder
      </button>
    </div>
  );
}
