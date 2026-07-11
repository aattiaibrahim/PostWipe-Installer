import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCatalogStore } from "../state/catalogStore";
import { SettingsPanel } from "./SettingsPanel";

/** Settings lives in its own little dock fixed to the very bottom-left, below the category
 *  sidebar. Because it's anchored to the bottom of the window it can only expand UPWARD —
 *  it can never grow out of view. While open, the category sidebar dims out of the way
 *  (state shared via catalogStore); gear again / Esc / click-away closes it. */
export function SidebarSettings() {
  const open = useCatalogStore((s) => s.settingsOpen);
  const setOpen = useCatalogStore((s) => s.setSettingsOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, setOpen]);

  return (
    <div className="settings-dock" ref={ref}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="settings-dock__panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            style={{ overflow: "hidden" }}
          >
            <SettingsPanel />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        className={`sidebar-settings__btn${open ? " sidebar-settings__btn--open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close settings" : "Open settings"}
        title="Settings"
      >
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: open ? 60 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32h.09a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77v.09a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97Z" />
        </motion.svg>
        <span>Settings</span>
      </button>
    </div>
  );
}
