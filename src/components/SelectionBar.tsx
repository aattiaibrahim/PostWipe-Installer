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
          {/* Re-keyed on every count change: an expanding ring + a count pop, so the pill
              visibly pulses each time something is selected or deselected. */}
          <motion.span
            key={`ring-${selected.length}`}
            className="selection-bar__pulse"
            initial={{ opacity: 0.55, scale: 1 }}
            animate={{ opacity: 0, scale: 1.18 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            aria-hidden="true"
          />
          <span className="selection-bar__count">
            <motion.span
              key={selected.length}
              style={{ display: "inline-block" }}
              initial={{ scale: 1.45 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              {selected.length}
            </motion.span>{" "}
            selected
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
