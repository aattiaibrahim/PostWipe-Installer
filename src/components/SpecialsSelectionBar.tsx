import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";
import { useSpecialsContentStore, flattenGroup } from "../state/specialsContentStore";
import { useSpecialsStore } from "../state/specialsStore";
import { startSpecialsDownload } from "../lib/tauriCommands";
import { gatedUrl } from "./SpecialsCard";

/** Batch-download pill for the Specials gallery: appears while items are checked, downloads
 *  every selected vault item through the Worker. Hovering it drops the list of selected
 *  items (each removable — removing the last one ends select mode). */
export function SpecialsSelectionBar() {
  const selected = useSpecialsSelectionStore((s) => s.selected);
  const toggle = useSpecialsSelectionStore((s) => s.toggle);
  const clear = useSpecialsSelectionStore((s) => s.clear);
  const groups = useSpecialsContentStore((s) => s.groups);
  const sessionKey = useSpecialsStore((s) => s.sessionKey);

  const all = groups.flatMap(flattenGroup);
  const nameOf = (key: string) => all.find((i) => i.objectKey === key)?.name ?? key.split("/").pop() ?? key;

  async function downloadSelected() {
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
          className="selection-wrap"
          // Same title-bar placement as the catalog SelectionBar (absolute, left:50%): x:"-50%"
          // rides along in every state or framer overwrites the horizontal centering.
          initial={{ opacity: 0, y: -34, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -34, x: "-50%" }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div className="selection-bar">
            {/* Same select/deselect pulse as the catalog SelectionBar. */}
            <motion.span
              key={`ring-${selected.length}`}
              className="selection-bar__pulse"
              initial={{ opacity: 0.55, scale: 1 }}
              animate={{ opacity: 0, scale: 1.18 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              aria-hidden="true"
            />
            <div className="selection-bar__actions">
              <button className="selection-bar__clear" onClick={clear}>
                Clear
              </button>
              {/* Count lives ONLY in this button (no "N selected" label repeating it). */}
              <button className="selection-bar__download" onClick={downloadSelected}>
                Download{" "}
                <motion.span
                  key={selected.length}
                  style={{ display: "inline-block" }}
                  initial={{ scale: 1.45 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                >
                  {selected.length}
                </motion.span>
              </button>
            </div>
          </div>
          <div className="selection-popover" role="list" aria-label="Selected items">
            <div className="selection-popover__panel">
              {selected.map((key) => (
                <div key={key} className="selection-popover__row" role="listitem">
                  <span className="selection-popover__name">{nameOf(key)}</span>
                  <button
                    className="selection-popover__remove"
                    onClick={() => toggle(key)}
                    aria-label={`Deselect ${nameOf(key)}`}
                    title="Remove from selection"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
