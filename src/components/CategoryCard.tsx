import { useState } from "react";
import type { Category, Os } from "../types/catalog";
import { AppCard } from "./AppCard";

interface CategoryCardProps {
  category: Category;
  os: Os;
  searchQuery: string;
}

export function CategoryCard({ category, os, searchQuery }: CategoryCardProps) {
  const [expanded, setExpanded] = useState(true);

  const query = searchQuery.trim().toLowerCase();
  const apps = category.apps.filter((app) => {
    if (!app.platforms[os]) return false;
    if (!query) return true;
    return app.name.toLowerCase().includes(query);
  });

  if (apps.length === 0) return null;

  return (
    <section className="category-card">
      <button className="category-card__header" onClick={() => setExpanded((e) => !e)}>
        <span className={`category-card__chevron${expanded ? " category-card__chevron--open" : ""}`}>&#9656;</span>
        <h2 className="category-card__title">{category.name}</h2>
        <span className="category-card__count">{apps.length}</span>
      </button>
      <div className={`category-card__collapse${expanded ? " category-card__collapse--open" : ""}`}>
        <div className="category-card__rows">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} os={os} />
          ))}
        </div>
      </div>
    </section>
  );
}
