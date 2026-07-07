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
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`os-picker__tile${osFilter === opt.value ? " os-picker__tile--active" : ""}`}
          onClick={() => setOsFilter(opt.value)}
        >
          <img className="os-picker__icon" src={opt.icon} alt="" />
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
