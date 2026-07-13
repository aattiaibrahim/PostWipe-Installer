import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";
import { useSpecialsContentStore } from "../state/specialsContentStore";
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
    const all = groups.flatMap((g) => [...g.items, ...g.subfolders.flatMap((sf) => sf.items)]);
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
          <span className="selection-bar__count">{selected.length} selected</span>
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
