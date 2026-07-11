import { AnimatePresence, motion } from "framer-motion";
import { useSelectionStore } from "../state/selectionStore";
import { useCatalogStore } from "../state/catalogStore";
import { startDownload } from "../lib/tauriCommands";

/** Batch-download pill that slides down from the very top of the app, centered in the
 *  title bar, whenever apps are checked. */
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
          // x:"-50%" belongs to the horizontal centering (position: absolute; left: 50%) and
          // must ride along in every state or framer would overwrite it while animating y.
          initial={{ opacity: 0, y: -34, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -34, x: "-50%" }}
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
