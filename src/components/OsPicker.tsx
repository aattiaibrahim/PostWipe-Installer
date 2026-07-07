import { motion } from "framer-motion";
import type { Os } from "../types/catalog";
import { useCatalogStore } from "../state/catalogStore";

const OPTIONS: { value: Os; label: string; icon: string }[] = [
  { value: "windows", label: "Windows", icon: "/icons/windows.ico" },
  { value: "macos", label: "macOS", icon: "/icons/macos.ico" },
];

export function OsPicker() {
  const osFilter = useCatalogStore((s) => s.osFilter);
  const setOsFilter = useCatalogStore((s) => s.setOsFilter);

  return (
    <div className="os-picker">
      {OPTIONS.map((opt) => {
        const active = osFilter === opt.value;
        return (
          <motion.button
            key={opt.value}
            className={`os-picker__tile${active ? " os-picker__tile--active" : ""}`}
            onClick={() => setOsFilter(opt.value)}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.98 }}
          >
            {active && (
              <motion.div
                className="os-picker__indicator"
                layoutId="os-picker-indicator"
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            )}
            <img className="os-picker__icon" src={opt.icon} alt="" />
            <span>{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
