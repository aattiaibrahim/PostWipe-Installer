import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
        <motion.span
          className="category-card__chevron"
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          &#9656;
        </motion.span>
        <h2 className="category-card__title">{category.name}</h2>
        <span className="category-card__count">{apps.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="category-card__collapse"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            style={{ overflow: "hidden" }}
          >
            <div className="category-card__rows">
              <AnimatePresence initial={false}>
                {apps.map((app) => (
                  <AppCard key={app.id} app={app} os={os} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
