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
  // CPU-vendor tools are Windows-only. Browse mounts/unmounts this via AnimatePresence when
  // the OS flips; the width animation collapses its space so the search bar grows into it.
  return (
    <motion.div
      className="os-picker os-picker--vendor"
      title="Filter vendor-specific tools (Intel/AMD)"
      layout
      initial={{ width: 0, opacity: 0, marginLeft: 0 }}
      animate={{ width: "auto", opacity: 1 }}
      exit={{ width: 0, opacity: 0, marginLeft: 0 }}
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      style={{ overflow: "hidden" }}
    >
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
    </motion.div>
  );
}
