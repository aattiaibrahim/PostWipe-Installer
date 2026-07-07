import type { Os } from "../types/catalog";
import { useCatalogStore } from "../state/catalogStore";

export function SearchFilterBar() {
  const osFilter = useCatalogStore((s) => s.osFilter);
  const setOsFilter = useCatalogStore((s) => s.setOsFilter);
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearchQuery = useCatalogStore((s) => s.setSearchQuery);

  const osOptions: { value: Os; label: string }[] = [
    { value: "windows", label: "Windows" },
    { value: "macos", label: "macOS" },
  ];

  return (
    <div className="search-filter-bar">
      <input
        className="search-filter-bar__input"
        type="search"
        placeholder="Search apps..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <div className="search-filter-bar__os-toggle">
        {osOptions.map((opt) => (
          <button
            key={opt.value}
            className={`os-toggle__option${osFilter === opt.value ? " os-toggle__option--active" : ""}`}
            onClick={() => setOsFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
