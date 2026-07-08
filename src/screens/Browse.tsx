import { useEffect } from "react";
import { useCatalogStore } from "../state/catalogStore";
import { useOsDetect } from "../hooks/useOsDetect";
import { useDownloadEvents } from "../hooks/useDownloadEvents";
import { OsPicker } from "../components/OsPicker";
import { SearchFilterBar } from "../components/SearchFilterBar";
import { CategorySidebar } from "../components/CategorySidebar";
import { CategoryPanel } from "../components/CategoryPanel";
import { DownloadQueuePanel } from "../components/DownloadQueuePanel";
import { ALL_CATEGORY_ID } from "../lib/constants";

export function Browse() {
  const {
    catalog,
    loading,
    error,
    osFilter,
    searchQuery,
    selectedCategoryId,
    setSelectedCategory,
    load,
  } = useCatalogStore();
  useOsDetect();
  useDownloadEvents();

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!catalog) return;
    if (selectedCategoryId === ALL_CATEGORY_ID) return;
    const stillAvailable = catalog.categories.some(
      (c) => c.id === selectedCategoryId && c.apps.some((app) => app.platforms[osFilter]),
    );
    if (stillAvailable) return;
    const fallback = catalog.categories.find((c) => c.apps.some((app) => app.platforms[osFilter]));
    setSelectedCategory(fallback ? fallback.id : ALL_CATEGORY_ID);
  }, [catalog, osFilter, selectedCategoryId, setSelectedCategory]);

  if (loading) return <div className="status-message">Loading catalog...</div>;
  if (error) return <div className="status-message status-message--error">Failed to load catalog: {error}</div>;
  if (!catalog) return null;

  return (
    <div className="browse">
      <div className="browse__topbar">
        <OsPicker />
        <SearchFilterBar />
      </div>
      <DownloadQueuePanel />
      <div className="browse__body">
        <CategorySidebar
          catalog={catalog}
          os={osFilter}
          searchQuery={searchQuery}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategory}
        />
        <CategoryPanel
          catalog={catalog}
          os={osFilter}
          searchQuery={searchQuery}
          selectedCategoryId={selectedCategoryId}
        />
      </div>
    </div>
  );
}
