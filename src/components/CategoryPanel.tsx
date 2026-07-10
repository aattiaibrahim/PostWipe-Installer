import { AnimatePresence } from "framer-motion";
import type { Catalog, Os } from "../types/catalog";
import { AppCard } from "./AppCard";
import { ALL_CATEGORY_ID } from "../lib/constants";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";
import { useCatalogStore } from "../state/catalogStore";
import { SpecialsLock } from "./SpecialsLock";
import { SpecialsUnlockBurst } from "./SpecialsUnlockBurst";
import { SpecialsContent } from "./SpecialsContent";

interface CategoryPanelProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedCategoryId: string | null;
}

export function CategoryPanel({ catalog, os, searchQuery, selectedCategoryId }: CategoryPanelProps) {
  const specialsUnlocked = useSpecialsStore((s) => s.unlocked);
  const justUnlocked = useSpecialsStore((s) => s.justUnlocked);
  // Vendor filter lives in the topbar now (VendorToggle) and applies to every category.
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  // Specials selected directly: the gate if locked, the live vault contents if unlocked.
  if (!isSearching && selectedCategoryId === SPECIALS_CATEGORY_ID) {
    return (
      <div className="category-panel">
        {justUnlocked && <SpecialsUnlockBurst />}
        {specialsUnlocked ? <SpecialsContent /> : <SpecialsLock />}
      </div>
    );
  }

  // Specials content is dynamic (from the Worker), never rendered as normal catalog rows,
  // so its placeholder entries stay out of the All view and search entirely.
  const categories = (
    isSearching || selectedCategoryId === ALL_CATEGORY_ID
      ? catalog.categories
      : catalog.categories.filter((c) => c.id === selectedCategoryId)
  ).filter((c) => c.id !== SPECIALS_CATEGORY_ID);

  const sections = categories
    .map((category) => ({
      category,
      apps: category.apps.filter((app) => {
        if (!app.platforms[os]) return false;
        // Vendor-tagged apps hide when the other vendor is selected; untagged apps always show.
        if (vendorFilter !== "all" && app.vendor && app.vendor !== vendorFilter) return false;
        if (!query) return true;
        return app.name.toLowerCase().includes(query);
      }),
    }))
    .filter((section) => section.apps.length > 0);

  if (sections.length === 0) {
    return (
      <div className="category-panel">
        {justUnlocked && <SpecialsUnlockBurst />}
        <p className="category-panel__empty">
          {isSearching ? "No apps match your search." : "No apps in this category yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="category-panel">
      {justUnlocked && <SpecialsUnlockBurst />}
      {sections.map(({ category, apps }) => (
        <section key={category.id} className="category-panel__section">
          <div className="category-panel__header">
            <h2 className="category-panel__title">{category.name}</h2>
          </div>
          <div className="category-panel__rows">
            <AnimatePresence initial={false}>
              {apps.map((app) => (
                <AppCard key={app.id} app={app} os={os} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  );
}
