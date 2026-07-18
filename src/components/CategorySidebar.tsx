import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
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

/* memo'd so Browse's urgent render (topbar animation frame) skips this subtree; it only
   re-renders in the deferred pass when the os/search props actually change. */
export const CategorySidebar = memo(function CategorySidebar({ catalog, os, searchQuery, selectedId, onSelect }: CategorySidebarProps) {
  const specialsUnlocked = useSpecialsStore((s) => s.unlocked);
  const settingsOpen = useCatalogStore((s) => s.settingsOpen);
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);
  const setDockShadow = useCatalogStore((s) => s.setDockShadow);
  const query = searchQuery.trim().toLowerCase();

  // The settings dock floats fixed over the sidebar's bottom edge. Two measurements drive
  // the interplay: `needsClearance` (the list is tall enough that its box runs behind the
  // dock — add bottom padding so the last rows can scroll clear of it) and `dockShadow`
  // (rows are behind the dock *right now* — the dock casts a shadow only then). Clearance
  // is computed from the content's own height, not the padded box, so toggling the padding
  // can't feed back into the measurement.
  const navRef = useRef<HTMLElement>(null);
  const catsRef = useRef<HTMLDivElement>(null);
  const [needsClearance, setNeedsClearance] = useState(false);
  useEffect(() => {
    const nav = navRef.current;
    const cats = catsRef.current;
    if (!nav || !cats) return;
    const dock = document.querySelector(".settings-dock");
    const measure = () => {
      const dockTop = dock ? dock.getBoundingClientRect().top : Infinity;
      // How far the sidebar's box runs behind the dock; the box bottom is capped by
      // max-height, so adding the padding can't feed the overlap back on itself.
      const overlap = Math.max(0, nav.getBoundingClientRect().bottom - dockTop);
      nav.style.setProperty("--dock-clearance", `${overlap ? Math.min(overlap + 12, 220) : 0}px`);
      setNeedsClearance(overlap > 0);
      setDockShadow(cats.getBoundingClientRect().bottom > dockTop + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cats);
    if (dock) ro.observe(dock); // fires as the dock expands/collapses
    nav.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      nav.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      setDockShadow(false);
    };
  }, [setDockShadow]);

  // Counts mirror exactly what the panel shows: platform + vendor + search filters.
  const countIn = (category: (typeof catalog.categories)[number]) =>
    category.apps.filter((app) => {
      // Bookmarks have no platforms — they count on every OS.
      if (app.kind !== "link" && !app.platforms[os]) return false;
      if (vendorFilter !== "all" && app.vendor && app.vendor !== vendorFilter) return false;
      return !query || app.name.toLowerCase().includes(query);
    }).length;

  const allCount = catalog.categories.reduce((total, category) => {
    if (category.id === SPECIALS_CATEGORY_ID && !specialsUnlocked) return total;
    return total + countIn(category);
  }, 0);

  return (
    <nav
      ref={navRef}
      className={`sidebar${settingsOpen ? " sidebar--settings-open" : ""}${needsClearance ? " sidebar--dock-clearance" : ""}`}
    >
      {/* While settings is expanded the categories dim + shrink out of the way; closing
          settings restores them untouched. */}
      <div ref={catsRef} className="sidebar__categories">
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
          // Bookmarks have no platforms, so a links-only category must not be hidden here.
          if (!category.apps.some((app) => app.kind === "link" || app.platforms[os])) return null;
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
});
