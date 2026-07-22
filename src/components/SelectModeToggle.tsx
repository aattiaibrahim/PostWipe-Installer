import { AnimatePresence, motion } from "framer-motion";
import { useCatalogStore } from "../state/catalogStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";

/** The "Select Multiple Apps" tool, living in the same title-bar slot as the selection
 *  pills: it shows while nothing is selected, and the moment items are checked it swaps
 *  out for the "N selected" bar (and back again when the selection empties — the two just
 *  keep switching). Mode itself ends automatically when the selection is cleared or the
 *  last item is deselected (see the selection stores). */
export function SelectModeToggle() {
  const selectMode = useCatalogStore((s) => s.selectMode);
  const setSelectMode = useCatalogStore((s) => s.setSelectMode);
  const catalogCount = useSelectionStore((s) => s.selected.length);
  const specialsCount = useSpecialsSelectionStore((s) => s.selected.length);
  const visible = catalogCount === 0 && specialsCount === 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className={`select-mode-toggle${selectMode ? " select-mode-toggle--on" : ""}`}
          initial={{ opacity: 0, y: -34, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -34, x: "-50%" }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          onClick={() => setSelectMode(!selectMode)}
          aria-pressed={selectMode}
          title={selectMode ? "Exit multi-select mode" : "Click apps to select several at once"}
        >
          {/* Styled as the same pill the "Clear | Download N" bar uses, with the label as
              an accent chip matching the Download button — the swap reads as one control. */}
          <span className="select-mode-toggle__label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="6" height="6" rx="1.5" />
              <path d="m4.6 8 1.4 1.4L8.6 6.8" />
              <rect x="3" y="14" width="6" height="6" rx="1.5" />
              <path d="M13 7h8M13 11h5M13 16h8M13 20h5" />
            </svg>
            {selectMode ? "Click apps to select…" : "Select Multiple Apps"}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
