import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Catalog, Os, Vendor } from "../types/catalog";
import { AppCard } from "./AppCard";
import { ALL_CATEGORY_ID } from "../lib/constants";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";
import { SpecialsLock } from "./SpecialsLock";
import { SpecialsUnlockBurst } from "./SpecialsUnlockBurst";

interface CategoryPanelProps {
  catalog: Catalog;
  os: Os;
  searchQuery: string;
  selectedCategoryId: string | null;
}

const OVERCLOCKING_CATEGORY_ID = "overclocking";
type VendorFilter = "all" | Vendor;
const VENDOR_OPTIONS: { value: VendorFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "intel", label: "Intel" },
  { value: "amd", label: "AMD" },
];

/** All/Intel/AMD lightswitch for the Overclocking category, styled like the OS picker. */
function VendorToggle({ value, onChange }: { value: VendorFilter; onChange: (v: VendorFilter) => void }) {
  return (
    <div className="os-picker os-picker--vendor">
      {VENDOR_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            className={`os-picker__tile${active ? " os-picker__tile--active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {active && (
              <motion.div
                className="os-picker__indicator"
                layoutId="vendor-toggle-indicator"
                transition={{ type: "spring", stiffness: 700, damping: 46, mass: 0.7 }}
              />
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CategoryPanel({ catalog, os, searchQuery, selectedCategoryId }: CategoryPanelProps) {
  const specialsUnlocked = useSpecialsStore((s) => s.unlocked);
  const justUnlocked = useSpecialsStore((s) => s.justUnlocked);
  const [vendorFilter, setVendorFilter] = useState<VendorFilter>("all");
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

  const showVendorToggle = !isSearching && selectedCategoryId === OVERCLOCKING_CATEGORY_ID;

  const sections = categories
    .map((category) => ({
      category,
      apps: category.apps.filter((app) => {
        if (!app.platforms[os]) return false;
        // Vendor filter applies only while browsing the Overclocking category directly.
        if (showVendorToggle && vendorFilter !== "all" && app.vendor && app.vendor !== vendorFilter) return false;
        if (!query) return true;
        return app.name.toLowerCase().includes(query);
      }),
    }))
    .filter((section) => section.apps.length > 0);

  if (sections.length === 0) {
    return (
      <div className="category-panel">
        {justUnlocked && <SpecialsUnlockBurst />}
        {/* Keep the toggle reachable so a vendor filter that empties the list can be undone. */}
        {showVendorToggle && <VendorToggle value={vendorFilter} onChange={setVendorFilter} />}
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
            {showVendorToggle && category.id === OVERCLOCKING_CATEGORY_ID && (
              <VendorToggle value={vendorFilter} onChange={setVendorFilter} />
            )}
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
