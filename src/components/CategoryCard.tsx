import type { Category, Os } from "../types/catalog";
import { AppCard } from "./AppCard";

interface CategoryCardProps {
  category: Category;
  os: Os;
  searchQuery: string;
}

export function CategoryCard({ category, os, searchQuery }: CategoryCardProps) {
  const query = searchQuery.trim().toLowerCase();
  const apps = category.apps.filter((app) => {
    if (!app.platforms[os]) return false;
    if (!query) return true;
    return app.name.toLowerCase().includes(query);
  });

  if (apps.length === 0) return null;

  return (
    <section className="category-card">
      <h2 className="category-card__title">{category.name}</h2>
      <div className="category-card__apps">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} os={os} />
        ))}
      </div>
    </section>
  );
}
