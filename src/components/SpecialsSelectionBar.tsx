import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";
import { useSpecialsContentStore, flattenGroup } from "../state/specialsContentStore";
import { useSpecialsStore } from "../state/specialsStore";
import { startSpecialsDownload } from "../lib/tauriCommands";
import { gatedUrl } from "./SpecialsCard";

/** Batch-download pill for the Specials gallery: appears while items are checked, downloads
 *  every selected vault item through the Worker. Sticky at the top of the gallery. */
export function SpecialsSelectionBar() {
  const selected = useSpecialsSelectionStore((s) => s.selected);
  const clear = useSpecialsSelectionStore((s) => s.clear);
  const groups = useSpecialsContentStore((s) => s.groups);
  const sessionKey = useSpecialsStore((s) => s.sessionKey);

  async function downloadSelected() {
    const all = groups.flatMap(flattenGroup);
    const targets = all.filter((i) => selected.includes(i.objectKey));
    for (const item of targets) {
      try {
        await startSpecialsDownload(item.objectKey, item.name, gatedUrl(item.objectKey, sessionKey), item.filename);
      } catch {
        // Per-item failures surface on their own card; keep queuing the rest.
      }
    }
    clear();
  }

  return (
    <AnimatePresence>
      {selected.length > 0 && (
        <motion.div
          className="selection-bar"
          // Same title-bar placement as the catalog SelectionBar (absolute, left:50%): x:"-50%"
          // rides along in every state or framer overwrites the horizontal centering.
          initial={{ opacity: 0, y: -34, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -34, x: "-50%" }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          {/* Same select/deselect pulse as the catalog SelectionBar. */}
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
