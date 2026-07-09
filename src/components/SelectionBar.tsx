import { AnimatePresence, motion } from "framer-motion";
import { useSelectionStore } from "../state/selectionStore";
import { useCatalogStore } from "../state/catalogStore";
import { startDownload } from "../lib/tauriCommands";

/** Floating bar that appears when apps are checked, to queue them all at once. */
export function SelectionBar() {
  const selected = useSelectionStore((s) => s.selected);
  const clear = useSelectionStore((s) => s.clear);
  const osFilter = useCatalogStore((s) => s.osFilter);

  async function downloadSelected() {
    for (const appId of selected) {
      try {
        await startDownload(appId, osFilter);
      } catch {
        // Per-app failures surface on their own rows; keep queuing the rest.
      }
    }
    clear();
  }

  return (
    <AnimatePresence>
      {selected.length > 0 && (
        <motion.div
          className="selection-bar"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <span className="selection-bar__count">
            {selected.length} selected
          </span>
          <div className="selection-bar__actions">
            <button className="selection-bar__clear" onClick={clear}>
              Clear
            </button>
            <button className="selection-bar__download" onClick={downloadSelected}>
              Download {selected.length}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
