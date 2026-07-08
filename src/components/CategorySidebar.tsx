import type { CSSProperties } from "react";
import type { Catalog, Os } from "../types/catalog";
import { CategoryIcon } from "../lib/categoryIcons";
import { categoryColor } from "../lib/categoryColors";
import { ALL_CATEGORY_ID } from "../lib/constants";

interface CategorySidebarProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CategorySidebar({ catalog, os, searchQuery, selectedId, onSelect }: CategorySidebarProps) {
  const query = searchQuery.trim().toLowerCase();

  const allCount = catalog.categories.reduce((total, category) => {
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

        return (
          <button
            key={category.id}
            className={`sidebar__item${selectedId === category.id ? " sidebar__item--active" : ""}`}
            style={{ "--cat-color": categoryColor(category.id) } as CSSProperties}
            onClick={() => onSelect(category.id)}
          >
            <CategoryIcon categoryId={category.id} className="sidebar__icon" />
            <span className="sidebar__label">{category.name}</span>
            <span className="sidebar__count">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}
