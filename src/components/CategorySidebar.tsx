import type { CSSProperties } from "react";
import type { Catalog, Os } from "../types/catalog";
import { CategoryIcon } from "../lib/categoryIcons";
import { categoryColor } from "../lib/categoryColors";
import { ALL_CATEGORY_ID } from "../lib/constants";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";

interface CategorySidebarProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
  const query = searchQuery.trim().toLowerCase();

  const allCount = catalog.categories.reduce((total, category) => {
    if (category.id === SPECIALS_CATEGORY_ID && !specialsUnlocked) return total;
    const available = category.apps.filter((app) => app.platforms[os]);
    return total + (query ? available.filter((app) => app.name.toLowerCase().includes(query)).length : available.length);
  }, 0);

  return (
    <nav className="sidebar">
      <button
        className={`sidebar__item${selectedId === ALL_CATEGORY_ID ? " sidebar__item--active" : ""}`}
        onClick={() => onSelect(ALL_CATEGORY_ID)}
      >
        <CategoryIcon categoryId={ALL_CATEGORY_ID} className="sidebar__icon" />
        <span className="sidebar__label">All</span>
        <span className="sidebar__count">{allCount}</span>
      </button>
      <div className="sidebar__divider" />
      {catalog.categories.map((category) => {
        const available = category.apps.filter((app) => app.platforms[os]);
        if (available.length === 0) return null;
        const count = query
          ? available.filter((app) => app.name.toLowerCase().includes(query)).length
          : available.length;
        const locked = category.id === SPECIALS_CATEGORY_ID && !specialsUnlocked;

        return (
          <button
            key={category.id}
            className={`sidebar__item${selectedId === category.id ? " sidebar__item--active" : ""}`}
            style={{ "--cat-color": categoryColor(category.id) } as CSSProperties}
            onClick={() => onSelect(category.id)}
          >
            <CategoryIcon categoryId={category.id} className="sidebar__icon" />
            <span className="sidebar__label">{category.name}</span>
            {locked ? <LockGlyph /> : <span className="sidebar__count">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
