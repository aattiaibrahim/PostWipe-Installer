import { motion } from "framer-motion";
import { useCatalogStore, type VendorFilter } from "../state/catalogStore";

const VENDOR_OPTIONS: { value: VendorFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "intel", label: "Intel" },
  { value: "amd", label: "AMD" },
];

/** All/Intel/AMD lightswitch, styled like the OS picker. Lives in the topbar and applies
 *  everywhere — apps tagged with a vendor are hidden when the other vendor is selected;
 *  untagged apps always show.
 *
 *  CPU-vendor tools are Windows-only, so the whole control collapses on macOS. It stays
 *  mounted and collapses via the .vendor-collapse CSS max-width transition instead of an
 *  AnimatePresence width:"auto" exit — the mount/unmount version rendered as a snap in the
 *  packaged app. As the wrapper narrows, the flex:1 search bar grows into the freed space
 *  every frame. */
export function VendorToggle({ open }: { open: boolean }) {
  const value = useCatalogStore((s) => s.vendorFilter);
  const onChange = useCatalogStore((s) => s.setVendorFilter);
  return (
    <div className={`vendor-collapse${open ? " vendor-collapse--open" : ""}`} aria-hidden={!open}>
      <div className="os-picker os-picker--vendor" title="Filter vendor-specific tools (Intel/AMD)">
        {VENDOR_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              className={`os-picker__tile${active ? " os-picker__tile--active" : ""}`}
              onClick={() => onChange(opt.value)}
              tabIndex={open ? 0 : -1}
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
    </div>
  );
}
