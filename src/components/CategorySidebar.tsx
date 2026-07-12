import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import type { Catalog, Os } from "../types/catalog";
import { CategoryIcon } from "../lib/categoryIcons";
import { categoryColor } from "../lib/categoryColors";
import { ALL_CATEGORY_ID } from "../lib/constants";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";
import { useCatalogStore } from "../state/catalogStore";

interface CategorySidebarProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The active row's colored pill. One shared layoutId across every row makes framer slide
 *  it vertically between rows on selection — same effect as the Windows/macOS picker. */
function ActiveIndicator() {
  return (
    <motion.div
      className="sidebar__active-bg"
      layoutId="sidebar-active-indicator"
      transition={{ type: "spring", stiffness: 550, damping: 42, mass: 0.8 }}
    />
  );
}

function LockGlyph() {
  return (
    <svg
      className="sidebar__lock"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Locked"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CategorySidebar({ catalog, os, searchQuery, selectedId, onSelect }: CategorySidebarProps) {
  const specialsUnlocked = useSpecialsStore((s) => s.unlocked);
  const settingsOpen = useCatalogStore((s) => s.settingsOpen);
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);
  const query = searchQuery.trim().toLowerCase();

  // Counts mirror exactly what the panel shows: platform + vendor + search filters.
  const countIn = (category: (typeof catalog.categories)[number]) =>
    category.apps.filter((app) => {
      if (!app.platforms[os]) return false;
      if (vendorFilter !== "all" && app.vendor && app.vendor !== vendorFilter) return false;
      return !query || app.name.toLowerCase().includes(query);
    }).length;

  const allCount = catalog.categories.reduce((total, category) => {
    if (category.id === SPECIALS_CATEGORY_ID && !specialsUnlocked) return total;
    return total + countIn(category);
  }, 0);

  return (
    <nav className={`sidebar${settingsOpen ? " sidebar--settings-open" : ""}`}>
      {/* While settings is expanded the categories dim + shrink out of the way; closing
          settings restores them untouched. */}
      <div className="sidebar__categories">
        <button
          className={`sidebar__item${selectedId === ALL_CATEGORY_ID ? " sidebar__item--active" : ""}`}
          onClick={() => onSelect(ALL_CATEGORY_ID)}
        >
          {selectedId === ALL_CATEGORY_ID && <ActiveIndicator />}
          <CategoryIcon categoryId={ALL_CATEGORY_ID} className="sidebar__icon" />
          <span className="sidebar__label">All</span>
          <span className="sidebar__count">{allCount}</span>
        </button>
        <div className="sidebar__divider" />
        {catalog.categories.map((category) => {
          if (!category.apps.some((app) => app.platforms[os])) return null;
          const count = countIn(category);
          const locked = category.id === SPECIALS_CATEGORY_ID && !specialsUnlocked;

          return (
            <button
              key={category.id}
              className={`sidebar__item${selectedId === category.id ? " sidebar__item--active" : ""}`}
              style={{ "--cat-color": categoryColor(category.id) } as CSSProperties}
              onClick={() => onSelect(category.id)}
            >
              {selectedId === category.id && <ActiveIndicator />}
              <CategoryIcon categoryId={category.id} className="sidebar__icon" />
              <span className="sidebar__label">{category.name}</span>
              {locked ? (
                <LockGlyph />
              ) : category.id === SPECIALS_CATEGORY_ID ? null : (
                <span className="sidebar__count">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
