import { AnimatePresence, motion } from "framer-motion";
import { useSelectionStore } from "../state/selectionStore";
import { useCatalogStore } from "../state/catalogStore";
import { startDownload } from "../lib/tauriCommands";
import { AppIcon } from "./AppIcon";

/** Batch-download pill that slides down from the very top of the app, centered in the
 *  title bar, whenever apps are checked. Hovering it drops a list of everything selected
 *  (each row can be removed individually — removing the last one ends select mode). */
export function SelectionBar() {
  const selected = useSelectionStore((s) => s.selected);
  const toggle = useSelectionStore((s) => s.toggle);
  const clear = useSelectionStore((s) => s.clear);
  const osFilter = useCatalogStore((s) => s.osFilter);
  const catalog = useCatalogStore((s) => s.catalog);

  const apps = catalog ? catalog.categories.flatMap((c) => c.apps) : [];
  const entries = selected.map((id) => apps.find((a) => a.id === id) ?? null);

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
          className="selection-wrap"
          // x:"-50%" belongs to the horizontal centering (position: absolute; left: 50%) and
          // must ride along in every state or framer would overwrite it while animating y.
          initial={{ opacity: 0, y: -34, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -34, x: "-50%" }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div className="selection-bar">
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
          </div>
          {/* Hover reveal — the padding bridge in CSS keeps it open while moving down. */}
          <div className="selection-popover" role="list" aria-label="Selected apps">
            <div className="selection-popover__panel">
              {selected.map((id, i) => {
                const app = entries[i];
                return (
                  <div key={id} className="selection-popover__row" role="listitem">
                    <AppIcon appId={id} name={app?.name ?? id} domain={app?.domain} className="selection-popover__icon" />
                    <span className="selection-popover__name">{app?.name ?? id}</span>
                    <button
                      className="selection-popover__remove"
                      onClick={() => toggle(id)}
                      aria-label={`Deselect ${app?.name ?? id}`}
                      title="Remove from selection"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
