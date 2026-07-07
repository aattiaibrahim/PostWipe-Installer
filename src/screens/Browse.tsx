import { useEffect } from "react";
import { useCatalogStore } from "../state/catalogStore";
import { useOsDetect } from "../hooks/useOsDetect";
import { useDownloadEvents } from "../hooks/useDownloadEvents";
import { OsPicker } from "../components/OsPicker";
import { SearchFilterBar } from "../components/SearchFilterBar";
import { CategoryGrid } from "../components/CategoryGrid";
import { DownloadQueuePanel } from "../components/DownloadQueuePanel";

export function Browse() {
  const { catalog, loading, error, osFilter, searchQuery, load } = useCatalogStore();
  useOsDetect();
  useDownloadEvents();

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="status-message">Loading catalog...</div>;
  if (error) return <div className="status-message status-message--error">Failed to load catalog: {error}</div>;
  if (!catalog) return null;

  return (
    <div className="browse">
      <OsPicker />
      <SearchFilterBar />
      <DownloadQueuePanel />
      <CategoryGrid catalog={catalog} os={osFilter} searchQuery={searchQuery} />
    </div>
  );
}
