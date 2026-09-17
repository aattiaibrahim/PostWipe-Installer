import { Fragment, memo } from "react";
import { AnimatePresence } from "framer-motion";
import type { Catalog, Os } from "../types/catalog";
import { AppCard } from "./AppCard";
import { ALL_CATEGORY_ID, FAVORITES_CATEGORY_ID } from "../lib/constants";
import { useAccountStore } from "../state/accountStore";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";
import { useCatalogStore } from "../state/catalogStore";
import { SpecialsLock } from "./SpecialsLock";
import { SpecialsUnlockBurst } from "./SpecialsUnlockBurst";
import { SpecialsContent } from "./SpecialsContent";
import { PublishVisibleSelectable } from "./SelectMode";
import { SET_CATEGORY_PREFIX, SetPage } from "./SetPage";
import { FavoritesPage } from "./FavoritesPage";

interface CategoryPanelProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedCategoryId: string | null;
}

/* memo'd so Browse's urgent render (topbar animation frame) skips this heavy subtree; it
   only re-renders in the deferred pass when the os/search props actually change. */
export const CategoryPanel = memo(function CategoryPanel({ catalog, os, searchQuery, selectedCategoryId }: CategoryPanelProps) {
  const specialsUnlocked = useSpecialsStore((s) => s.unlocked);
  const justUnlocked = useSpecialsStore((s) => s.justUnlocked);
  // Vendor filter lives in the topbar now (VendorToggle) and applies to every category.
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);
  const favorites = useAccountStore((s) => s.profile.favorites);
  const setSelectedCategory = useCatalogStore((s) => s.setSelectedCategory);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  if (!isSearching && selectedCategoryId === FAVORITES_CATEGORY_ID) {
    return <FavoritesPage catalog={catalog} os={os} />;
  }

  if (!isSearching && selectedCategoryId?.startsWith(SET_CATEGORY_PREFIX)) {
    return <SetPage catalog={catalog} os={os} setId={selectedCategoryId.slice(SET_CATEGORY_PREFIX.length)} />;
  }

  // Specials selected directly: the gate if locked, the live vault contents if unlocked.
  if (!isSearching && selectedCategoryId === SPECIALS_CATEGORY_ID) {
    return (
      <div className="category-panel">
        <PublishVisibleSelectable ids="" />
        {justUnlocked && <SpecialsUnlockBurst />}
        {specialsUnlocked ? <SpecialsContent /> : <SpecialsLock />}
      </div>
    );
  }

  // Specials content is dynamic (from the Worker), never rendered as normal catalog rows,
  // so its placeholder entries stay out of the All view and search entirely.
  // Favorites gathers the starred apps from every category into one section.
  const favoritesView = !isSearching && selectedCategoryId === FAVORITES_CATEGORY_ID;
  const categories = favoritesView
    ? [
        {
          id: FAVORITES_CATEGORY_ID,
          name: "Favorites",
          apps: catalog.categories
            .filter((c) => c.id !== SPECIALS_CATEGORY_ID)
            .flatMap((c) => c.apps)
            .filter((app) => favorites.includes(app.id)),
        },
      ]
    : (isSearching || selectedCategoryId === ALL_CATEGORY_ID
        ? catalog.categories
        : catalog.categories.filter((c) => c.id === selectedCategoryId)
      ).filter((c) => c.id !== SPECIALS_CATEGORY_ID);

  const sections = categories
    .map((category) => ({
      category,
      apps: category.apps.filter((app) => {
        // Bookmarks have no platforms — they're relevant on every OS.
        if (app.kind !== "link" && !app.platforms[os]) return false;
        // Vendor-tagged apps hide when the other vendor is selected; untagged apps always show.
        if (vendorFilter !== "all" && app.vendor && app.vendor !== vendorFilter) return false;
        if (!query) return true;
        return app.name.toLowerCase().includes(query);
      }),
    }))
    .filter((section) => section.apps.length > 0);

  // What "Select all" in the toolbar selects: the downloadable apps on this page.
  const visibleIds = sections
    .flatMap((s) => s.apps)
    .filter((app) => app.kind === "download" && !!app.platforms[os]?.resolver)
    .map((app) => app.id)
    .join(",");

  if (sections.length === 0) {
    return (
      <div className="category-panel">
        <PublishVisibleSelectable ids="" />
        {justUnlocked && <SpecialsUnlockBurst />}
        <p className="category-panel__empty">
          {isSearching
            ? "No apps match your search."
            : favoritesView
              ? "No favorites yet. Star an app with ☆ and it'll show up here on every PC you sign in on."
              : "No apps in this category yet."}
        </p>
      </div>
    );
  }

  // App Store-style page title. With several sections (All, search results) each section also
  // gets a "See All" that jumps to its category.
  const total = sections.reduce((n, s) => n + s.apps.length, 0);
  const multi = sections.length > 1;
  const pageTitle = isSearching
    ? `Results for “${searchQuery.trim()}”`
    : favoritesView
      ? "Favorites"
      : selectedCategoryId === ALL_CATEGORY_ID
        ? "All Apps"
        : (sections[0]?.category.name ?? "");

  return (
    <div className="category-panel">
      <PublishVisibleSelectable ids={visibleIds} />
      {justUnlocked && <SpecialsUnlockBurst />}
      <header className="store-head">
        <h1 className="store-head__title">{pageTitle}</h1>
        <p className="store-head__sub">
          {total} {total === 1 ? "app" : "apps"}
        </p>
      </header>
      {sections.map(({ category, apps }) => (
        <section key={category.id} className="category-panel__section">
          {multi && (
            <div className="category-panel__header">
              <h2 className="category-panel__title">{category.name}</h2>
              {category.id !== FAVORITES_CATEGORY_ID && (
                <button className="store-see-all" onClick={() => setSelectedCategory(category.id)}>
                  See All
                </button>
              )}
            </div>
          )}
          <div className="category-panel__rows">
            <AnimatePresence initial={false}>
              {apps.map((app, i) => (
                <Fragment key={app.id}>
                  {/* Optional sub-heading inside a category (Essential Bookmarks groups its
                      links by topic without needing real sub-categories). */}
                  {app.group && app.group !== apps[i - 1]?.group && (
                    <h3 className="category-panel__group">{app.group}</h3>
                  )}
                  <AppCard app={app} os={os} />
                </Fragment>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  );
});
