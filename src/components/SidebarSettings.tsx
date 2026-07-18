import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCatalogStore } from "../state/catalogStore";
import { SettingsPanel } from "./SettingsPanel";

/** Settings lives in its own little dock fixed to the very bottom-left, below the category
 *  sidebar. Because it's anchored to the bottom of the window it can only expand UPWARD —
 *  it can never grow out of view. While open, the category sidebar dims out of the way
 *  (state shared via catalogStore); gear again / Esc / click-away closes it. */
export function SidebarSettings() {
  const open = useCatalogStore((s) => s.settingsOpen);
  const setOpen = useCatalogStore((s) => s.setSettingsOpen);
  const dockShadow = useCatalogStore((s) => s.dockShadow);
  const ref = useRef<HTMLDivElement>(null);

  // Animating framer's height to the "auto" KEYWORD with a spring jump-cuts to the final
  // size (the "snapping" bug report) — so the panel stays mounted, its natural height is
  // measured for real, and the spring runs between two plain numbers instead.
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContentHeight(el.offsetHeight));
    ro.observe(el);
    setContentHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    // While the Download-All confirm dialog (portaled to <body>) is up, its clicks and
    // Esc belong to the dialog — closing the dock would unmount the dialog mid-choice.
    const confirmIsOpen = () => document.querySelector(".confirm-overlay") !== null;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmIsOpen()) setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (confirmIsOpen()) return;
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
    <div className={`settings-dock${dockShadow ? " settings-dock--shadow" : ""}`} ref={ref}>
      <motion.div
        className="settings-dock__panel"
        initial={false}
        animate={{ height: open ? contentHeight : 0, opacity: open ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        style={{ overflow: "hidden", pointerEvents: open ? "auto" : "none" }}
        aria-hidden={!open}
      >
        <div ref={innerRef} className="settings-dock__panel-inner">
          <SettingsPanel />
        </div>
      </motion.div>
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
