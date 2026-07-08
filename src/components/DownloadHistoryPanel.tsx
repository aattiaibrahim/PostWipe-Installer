import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useDownloadHistoryStore } from "../state/downloadHistoryStore";
import { useClickOutside } from "../hooks/useClickOutside";

export function DownloadHistoryPanel() {
  const [open, setOpen] = useState(false);
  const entries = useDownloadHistoryStore((s) => s.entries);
  const panelRef = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="download-history" ref={panelRef}>
      <button className="download-history__toggle" onClick={() => setOpen((o) => !o)}>
        Downloaded{entries.length > 0 && <span className="download-history__count">{entries.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="download-history__dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {entries.length === 0 ? (
              <p className="download-history__empty">Nothing downloaded yet.</p>
            ) : (
              <ul className="download-history__list">
                {entries.map((entry) => (
                  <li key={entry.destPath}>
                    <button className="download-history__item" onClick={() => revealItemInDir(entry.destPath)}>
                      {entry.appName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
