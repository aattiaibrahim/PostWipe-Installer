import { useDeferredValue, useEffect } from "react";
import { useCatalogStore } from "../state/catalogStore";
import { useOsDetect } from "../hooks/useOsDetect";
import { useDownloadEvents } from "../hooks/useDownloadEvents";
import { SearchField, ToolbarActions } from "../components/SearchFilterBar";
import { CategorySidebar } from "../components/CategorySidebar";
import { CategoryPanel } from "../components/CategoryPanel";
import { ALL_CATEGORY_ID, FAVORITES_CATEGORY_ID, HOME_CATEGORY_ID } from "../lib/constants";
import { HomePage } from "../components/HomePage";
import { useAccountStore } from "../state/accountStore";

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
  const signedIn = useAccountStore((s) => s.user !== null);
  useOsDetect();
  useDownloadEvents();

  // Switching OS re-renders every catalog row at once — done synchronously that blocks the
  // main thread for ~200ms and freezes the vendor-toggle/search-bar animation into a snap.
  // Deferring the values the heavy lists consume lets the topbar animate in an urgent render
  // while the list catches up in an interruptible one (the lists are memo'd so the urgent
  // pass skips them entirely).
  const deferredOs = useDeferredValue(osFilter);
  const deferredQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the selection valid when the OS filter flips. Bookmarks carry no platforms and are
  // valid on every OS, so they must count as available or this would bounce you off them.
  useEffect(() => {
    if (!catalog) return;
    if (selectedCategoryId === ALL_CATEGORY_ID || selectedCategoryId === HOME_CATEGORY_ID) return;
    // Favorites is a virtual view, valid on either OS — until the account signs out.
    if (selectedCategoryId === FAVORITES_CATEGORY_ID) {
      if (!signedIn) setSelectedCategory(ALL_CATEGORY_ID);
      return;
    }
    const usable = (app: { kind: string; platforms: Record<string, unknown> }) =>
      app.kind === "link" || !!app.platforms[osFilter];
    const stillAvailable = catalog.categories.some(
      (c) => c.id === selectedCategoryId && c.apps.some(usable),
    );
    if (stillAvailable) return;
    const fallback = catalog.categories.find((c) => c.apps.some(usable));
    setSelectedCategory(fallback ? fallback.id : ALL_CATEGORY_ID);
  }, [catalog, osFilter, selectedCategoryId, setSelectedCategory, signedIn]);

  if (loading) return <div className="status-message">Loading catalog...</div>;
  if (error) return <div className="status-message status-message--error">Failed to load catalog: {error}</div>;
  if (!catalog) return null;

  return (
    // Golden Gate layout: an edge-to-edge sidebar column (search on top, like the App Store)
    // and a main column that scrolls on its own under one uniform toolbar.
    <div className="browse">
      <aside className="gg-side">
        <SearchField />
        <CategorySidebar
          catalog={catalog}
          os={deferredOs}
          searchQuery={deferredQuery}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategory}
        />
      </aside>
      <main className="gg-main">
        <div className="gg-toolbar">
          {/* The OS and Intel/AMD come from this computer; Settings ▸ Apps shown overrides them. */}
          <span className="gg-toolbar__spacer" />
          <ToolbarActions />
        </div>
        <div className="gg-content">
          {/* Typing a search from Home shows results, not the storefront. */}
          {selectedCategoryId === HOME_CATEGORY_ID && !deferredQuery.trim() ? (
            <HomePage catalog={catalog} os={deferredOs} />
          ) : (
            <CategoryPanel
              catalog={catalog}
              os={deferredOs}
              searchQuery={deferredQuery}
              selectedCategoryId={selectedCategoryId}
            />
          )}
        </div>
      </main>
    </div>
  );
}
