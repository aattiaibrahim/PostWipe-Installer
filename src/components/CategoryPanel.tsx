import { AnimatePresence } from "framer-motion";
import type { Catalog, Os } from "../types/catalog";
import { AppCard } from "./AppCard";
import { ALL_CATEGORY_ID } from "../lib/constants";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";
import { SpecialsLock } from "./SpecialsLock";

interface CategoryPanelProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedCategoryId: string | null;
}

export function CategoryPanel({ catalog, os, searchQuery, selectedCategoryId }: CategoryPanelProps) {
  const specialsUnlocked = useSpecialsStore((s) => s.unlocked);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  // The password curtain: selecting Specials while locked shows the gate instead of content.
  if (!isSearching && selectedCategoryId === SPECIALS_CATEGORY_ID && !specialsUnlocked) {
    return (
      <div className="category-panel">
        <SpecialsLock />
      </div>
    );
  }

  const categories = (
    isSearching || selectedCategoryId === ALL_CATEGORY_ID
      ? catalog.categories
      : catalog.categories.filter((c) => c.id === selectedCategoryId)
  ).filter(
    // Locked Specials content must not leak through search or the All view.
    (c) => c.id !== SPECIALS_CATEGORY_ID || specialsUnlocked,
  );

  const sections = categories
    .map((category) => ({
      category,
      apps: category.apps.filter((app) => {
        if (!app.platforms[os]) return false;
        if (!query) return true;
        return app.name.toLowerCase().includes(query);
      }),
    }))
    .filter((section) => section.apps.length > 0);

  if (sections.length === 0) {
    return (
      <div className="category-panel">
        <p className="category-panel__empty">
          {isSearching ? "No apps match your search." : "No apps in this category yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="category-panel">
      {sections.map(({ category, apps }) => (
        <section key={category.id} className="category-panel__section">
          <h2 className="category-panel__title">{category.name}</h2>
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
