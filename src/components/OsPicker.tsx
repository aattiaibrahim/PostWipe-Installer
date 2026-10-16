import { motion } from "framer-motion";
import type { Os } from "../types/catalog";
import { useCatalogStore } from "../state/catalogStore";

const WINDOWS_PATH = "M0 3.5L9.5 2.2V11.3H0V3.5Z M10.6 2.1L24 0V11.3H10.6V2.1Z M0 12.4H9.5V21.5L0 20.2V12.4Z M10.6 12.4H24V24L10.6 21.9V12.4Z";
const APPLE_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

const OPTIONS: { value: Os; label: string; path: string }[] = [
  { value: "windows", label: "Windows", path: WINDOWS_PATH },
  { value: "macos", label: "macOS", path: APPLE_PATH },
];

export function OsPicker() {
  const osFilter = useCatalogStore((s) => s.osFilter);
  const setOsFilter = useCatalogStore((s) => s.setOsFilter);

  return (
    <div className="os-picker">
      {OPTIONS.map((opt) => {
        const active = osFilter === opt.value;
        return (
          <button
            key={opt.value}
            className={`os-picker__tile${active ? " os-picker__tile--active" : ""}`}
            onClick={() => setOsFilter(opt.value)}
          >
            {active && (
              <motion.div
                className="os-picker__indicator"
                layoutId="os-picker-indicator"
                transition={{ type: "spring", stiffness: 700, damping: 46, mass: 0.7 }}
              />
            )}
            <svg className="os-picker__icon" viewBox="0 0 24 24" fill="currentColor">
              <path d={opt.path} />
            </svg>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
