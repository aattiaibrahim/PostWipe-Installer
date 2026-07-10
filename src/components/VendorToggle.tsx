import { motion } from "framer-motion";
import { useCatalogStore, type VendorFilter } from "../state/catalogStore";

const VENDOR_OPTIONS: { value: VendorFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "intel", label: "Intel" },
  { value: "amd", label: "AMD" },
];

/** All/Intel/AMD lightswitch, styled like the OS picker. Lives in the topbar and applies
 *  everywhere — apps tagged with a vendor are hidden when the other vendor is selected;
 *  untagged apps always show. */
export function VendorToggle() {
  const value = useCatalogStore((s) => s.vendorFilter);
  const onChange = useCatalogStore((s) => s.setVendorFilter);
  return (
    <div className="os-picker os-picker--vendor" title="Filter vendor-specific tools (Intel/AMD)">
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
