import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useCatalogStore, type DockView } from "../state/catalogStore";
import { useAccountStore } from "../state/accountStore";
import { SettingsWindow } from "./SettingsPanel";
import { AccountPanel } from "./AccountPanel";

/** The dock is as wide as the category sidebar above it. */
const DOCK_WIDTH = 236;
const BUBBLE = 50;
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

/** Shared by the bubble's width and its label, so the text is always revealed in lockstep with
 *  the edge that uncovers it. A tween, not a spring: a spring's settle overshoots the width,
 *  which read as the pill "wobbling" around its label. */
const STRETCH = { duration: 0.34, ease: [0.22, 1, 0.36, 1] } as const;

/** One round glass bubble that pops and stretches into a labelled pill when it's the open one.
 *
 *  Smoothness rules learned the hard way ("cut off", "choppy"):
 *   - The label is ALWAYS mounted, at its full natural width, with nowrap. Growing the button
 *     simply uncovers it (the button clips), so the text never reflows or gets truncated
 *     mid-animation. The old version mounted it and animated its own width 0→auto on a
 *     different curve from the button, which chopped letters off and jumped at the end.
 *   - Only the button's width animates as layout; the label just fades/slides (transform +
 *     opacity, compositor-only).
 *   - The "pop" is a separate, quick transform on the icon, not a scale on the whole
 *     resizing button, so the two never fight. */
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
      animate={{ width: open ? PILL_WIDTH : BUBBLE }}
      transition={{ width: STRETCH }}
      whileTap={{ scale: 0.94 }}
    >
      <motion.span
        className="dock__icon"
        initial={false}
        animate={{ scale: open ? [1, 1.22, 1] : 1 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
      >
        {icon}
      </motion.span>
      <motion.span
        className="dock__label"
        aria-hidden={!open}
        initial={false}
        animate={{ opacity: open ? 1 : 0, x: open ? 0 : -8 }}
        // Fades in slightly after the edge starts moving, and out quickly on close, so the
        // label is never visible being clipped by a shrinking pill.
        transition={open ? { duration: 0.24, delay: 0.08, ease: "easeOut" } : { duration: 0.12, ease: "easeIn" }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}

/** Bottom-left dock: a Settings bubble and an Account bubble. Clicking either pops it into a
 *  pill. Account raises its panel above, expanding UPWARD from the window's bottom edge so it
 *  can never grow out of view; Settings opens the tabbed Settings window instead (it outgrew a
 *  sidebar-width column). The same bubble, Esc, or a click elsewhere closes either. */
export function SidebarSettings() {
  const view = useCatalogStore((s) => s.dockView);
  const setView = useCatalogStore((s) => s.setDockView);
  const dockShadow = useCatalogStore((s) => s.dockShadow);
  const user = useAccountStore((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);

  const panelOpen = view === "account";

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
        animate={{ height: panelOpen ? panelHeight : 0, opacity: panelOpen ? 1 : 0, y: panelOpen ? 0 : 12 }}
        transition={{ duration: 0.26, ease: [0.33, 0.8, 0.3, 1] }}
        style={{ overflow: "hidden", pointerEvents: panelOpen ? "auto" : "none" }}
        aria-hidden={!panelOpen}
      >
        <div
          ref={innerRef}
          className="settings-dock__panel-inner"
          style={maxPanelH === null ? undefined : { maxHeight: maxPanelH }}
        >
          <AccountPanel />
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
      <SettingsWindow open={view === "settings"} onClose={() => setView(null)} />
    </div>
  );
}
