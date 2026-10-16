import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/tauriCommands";
import { LogoMark } from "./LogoMark";

/** Shown when the app is launched again while it's already running. The single-instance plugin
 *  (lib.rs) blocks the second copy and brings this window forward; this pill says why, so a
 *  double-click on the shortcut doesn't look like it was ignored. */
export function AlreadyOpenNotice() {
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    const show = () => setShownAt(Date.now());
    // Dev/browser preview hook, so the notice can be checked without two desktop builds.
    window.addEventListener("postwipe:already-open", show);
    const unlisten = isTauri ? listen("app://already-open", show) : null;
    return () => {
      window.removeEventListener("postwipe:already-open", show);
      void unlisten?.then((off) => off());
    };
  }, []);

  useEffect(() => {
    if (shownAt === null) return;
    const t = window.setTimeout(() => setShownAt(null), 3200);
    return () => window.clearTimeout(t);
  }, [shownAt]);

  return (
    <AnimatePresence>
      {shownAt !== null && (
        <motion.div
          key={shownAt}
          className="already-open"
          role="status"
          initial={{ opacity: 0, y: -14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <LogoMark className="already-open__logo" />
          <span>
            <strong>PostWipe Installer is already open</strong>
            <span>Here it is. Only one copy runs at a time.</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
