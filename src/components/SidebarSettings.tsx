import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCatalogStore, type DockView } from "../state/catalogStore";
import { useAccountStore } from "../state/accountStore";
import { SettingsPanel } from "./SettingsPanel";
import { AccountPanel } from "./AccountPanel";

/** The dock is as wide as the category sidebar above it. */
const DOCK_WIDTH = 236;
const BUBBLE = 44;
const GAP = 8;
/** An opened bubble stretches into a pill across the rest of the dock. */
const PILL_WIDTH = DOCK_WIDTH - BUBBLE - GAP;

const GearIcon = ({ spin }: { spin: boolean }) => (
  <motion.svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    animate={{ rotate: spin ? 90 : 0 }}
    transition={{ type: "spring", stiffness: 260, damping: 20 }}
  >
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32h.09a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77v.09a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97Z" />
  </motion.svg>
);

function PersonIcon({ initial }: { initial: string | null }) {
  if (initial) return <span className="dock__initial">{initial}</span>;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

/** One round glass bubble that pops and stretches into a labelled pill when it's the open one.
 *  The label unrolls out of the icon (its width grows from 0), so "Settings" reads as coming
 *  out of the gear rather than fading in beside it. */
function Bubble({
  open,
  label,
  icon,
  onClick,
  className,
}: {
  open: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className: string;
}) {
  return (
    <motion.button
      className={`dock__bubble ${className}${open ? " dock__bubble--open" : ""}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      initial={false}
      // Numeric widths, not framer `layout`: layout animates with a scale transform, which
      // would squash the icon and text mid-stretch.
      animate={{ width: open ? PILL_WIDTH : BUBBLE, scale: open ? [1, 1.1, 0.97, 1] : 1 }}
      transition={{
        width: { type: "spring", stiffness: 420, damping: 30 },
        scale: { duration: 0.42, times: [0, 0.35, 0.7, 1], ease: "easeOut" },
      }}
      whileTap={{ scale: 0.9 }}
    >
      <span className="dock__icon">{icon}</span>
      <AnimatePresence initial={false}>
        {open && (
          <motion.span
            className="dock__label"
            initial={{ width: 0, opacity: 0, x: -10 }}
            animate={{ width: "auto", opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: -10 }}
            transition={{ duration: 0.24, ease: [0.33, 0.8, 0.3, 1] }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Bottom-left dock: a Settings bubble and an Account bubble. Clicking either pops it into a
 *  pill and raises its panel above; only one is open at a time, and it expands UPWARD from the
 *  window's bottom edge so it can never grow out of view. While open the category sidebar
 *  dims out of the way; the same bubble, Esc, or a click elsewhere closes it. */
export function SidebarSettings() {
  const view = useCatalogStore((s) => s.dockView);
  const setView = useCatalogStore((s) => s.setDockView);
  const dockShadow = useCatalogStore((s) => s.dockShadow);
  const user = useAccountStore((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);

  // Keep rendering the last panel while it collapses, so closing doesn't flash the other one.
  const [shown, setShown] = useState<DockView>("settings");
  useEffect(() => {
    if (view) setShown(view);
  }, [view]);

  // Animating framer's height to the "auto" KEYWORD with a spring jump-cuts to the final
  // size (the "snapping" bug report) — so the panel stays mounted, its natural height is
  // measured for real, and the animation runs between two plain numbers instead.
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

  // How tall the panel may get, MEASURED rather than guessed: the gap between the title bar
  // and this dock's fixed bottom edge, minus the bubble row. Guessed constants were wrong
  // twice — the panel either climbed past the title bar or clipped its own content.
  const [maxPanelH, setMaxPanelH] = useState<number | null>(null);
  useEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    const measure = () => {
      const titleBar = document.querySelector(".title-bar");
      const topLimit = (titleBar ? titleBar.getBoundingClientRect().bottom : 0) + 12;
      const avail = dock.getBoundingClientRect().bottom - topLimit - BUBBLE - GAP - 18;
      setMaxPanelH(Math.max(140, Math.floor(avail)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const panelHeight = maxPanelH === null ? contentHeight : Math.min(contentHeight, maxPanelH);

  useEffect(() => {
    if (!view) return;
    // While a dialog portaled to <body> is up (Download All, the account dialog), its clicks
    // and Esc belong to the dialog — closing the dock would unmount it mid-choice.
    const dialogIsOpen = () => document.querySelector(".confirm-overlay") !== null;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !dialogIsOpen()) setView(null);
    }
    function onDown(e: MouseEvent) {
      if (dialogIsOpen()) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setView(null);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [view, setView]);

  const toggle = (target: DockView) => setView(view === target ? null : target);
  const accountLabel = user ? (user.name || user.email.split("@")[0]) : "Sign in";

  return (
    <div className="dock" ref={ref} style={{ width: DOCK_WIDTH }}>
      <motion.div
        className={`dock__panel${dockShadow ? " dock__panel--shadow" : ""}`}
        initial={false}
        // Deterministic tween, not a spring: any overshoot on an animated `height` reveals
        // an empty strip under the content for a frame.
        animate={{ height: view ? panelHeight : 0, opacity: view ? 1 : 0, y: view ? 0 : 12 }}
        transition={{ duration: 0.26, ease: [0.33, 0.8, 0.3, 1] }}
        style={{ overflow: "hidden", pointerEvents: view ? "auto" : "none" }}
        aria-hidden={!view}
      >
        <div
          ref={innerRef}
          className="settings-dock__panel-inner"
          style={maxPanelH === null ? undefined : { maxHeight: maxPanelH }}
        >
          {shown === "settings" ? <SettingsPanel /> : <AccountPanel />}
        </div>
      </motion.div>
      <div className="dock__bar">
        <Bubble
          className="dock__bubble--settings"
          open={view === "settings"}
          label="Settings"
          icon={<GearIcon spin={view === "settings"} />}
          onClick={() => toggle("settings")}
        />
        <Bubble
          className="dock__bubble--account"
          open={view === "account"}
          label={accountLabel}
          icon={<PersonIcon initial={user ? (user.name || user.email).charAt(0).toUpperCase() : null} />}
          onClick={() => toggle("account")}
        />
      </div>
    </div>
  );
}
