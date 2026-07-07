import type { Catalog, Os } from "../types/catalog";
import { CategoryCard } from "./CategoryCard";

interface CategoryGridProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
}

export function CategoryGrid({ catalog, os, searchQuery }: CategoryGridProps) {
  return (
    <div className="category-grid">
      {catalog.categories.map((category) => (
        <CategoryCard key={category.id} category={category} os={os} searchQuery={searchQuery} />
      ))}
    </div>
  );
}
