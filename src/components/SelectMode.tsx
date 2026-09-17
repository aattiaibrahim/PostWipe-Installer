import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import { useCatalogStore } from "../state/catalogStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";
import { useSpecialsContentStore, flattenGroup } from "../state/specialsContentStore";
import { SPECIALS_CATEGORY_ID, useSpecialsStore } from "../state/specialsStore";
import { useAccountStore } from "../state/accountStore";
import { startDownload, startSpecialsDownload } from "../lib/tauriCommands";
import { AppIcon } from "./AppIcon";
import { useSaveSetDialog } from "./SaveSetDialog";
import { useAccountDialog } from "./AccountDialog";
import { gatedUrl } from "./SpecialsCard";
import { HOME_CATEGORY_ID } from "../lib/constants";

/** The selectable apps on screen right now, published by CategoryPanel so "Select all" means
 *  "everything I'm looking at", not the whole catalog. */
export const useVisibleSelectable = create<{ ids: string[]; set: (ids: string[]) => void }>((set) => ({
  ids: [],
  set: (ids) => set({ ids }),
}));

/** Renders nothing; keeps useVisibleSelectable in step with the page (`ids` comma-joined so the
 *  effect only fires when the set of apps actually changes). */
export function PublishVisibleSelectable({ ids }: { ids: string }) {
  const set = useVisibleSelectable((s) => s.set);
  useEffect(() => set(ids ? ids.split(",") : []), [ids, set]);
  return null;
}

/** iOS/Photos-style selecting, living in the toolbar where the other actions are.
 *
 *  Browsing: a plain "Select" button. Selecting: "Cancel" on the left, the count in the middle,
 *  "Select all" on the right, while each card's Get pill becomes a circle and the action bar
 *  (SelectionActionBar) rises at the bottom. Replaces the old floating title-bar pill. */
export function SelectToolbar() {
  const selectMode = useCatalogStore((s) => s.selectMode);
  const setSelectMode = useCatalogStore((s) => s.setSelectMode);
  const category = useCatalogStore((s) => s.selectedCategoryId);
  const selected = useSelectionStore((s) => s.selected);
  const replace = useSelectionStore((s) => s.replace);
  const clear = useSelectionStore((s) => s.clear);
  const specialsSelected = useSpecialsSelectionStore((s) => s.selected.length);
  const clearSpecials = useSpecialsSelectionStore((s) => s.clear);
  const visible = useVisibleSelectable((s) => s.ids);
  const inSpecials = category === SPECIALS_CATEGORY_ID;
  const count = inSpecials ? specialsSelected : selected.length;

  const cancel = () => {
    clear();
    clearSpecials();
    setSelectMode(false);
  };

  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      // A dialog above (Save set, account) owns its own Esc.
      if (e.key === "Escape" && !document.querySelector(".confirm-overlay")) cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

  if (!selectMode) {
    // Discover is a storefront of shelves, not a list to pick from.
    if (category === HOME_CATEGORY_ID) return null;
    return (
      <button className="select-toolbar__btn" onClick={() => setSelectMode(true)} title="Pick several apps to download together or save as a set">
        Select
      </button>
    );
  }

  const allVisibleSelected = visible.length > 0 && visible.every((id) => selected.includes(id));
  return (
    <>
      <button className="select-toolbar__btn select-toolbar__btn--lead" onClick={cancel}>
        Cancel
      </button>
      <motion.span key={count} className="select-toolbar__count" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
        {count ? `${count} selected` : "Select items"}
      </motion.span>
      {!inSpecials && visible.length > 0 && (
        <button
          className="select-toolbar__btn"
          onClick={() =>
            allVisibleSelected
              ? replace(selected.filter((id) => !visible.includes(id)))
              : replace([...new Set([...selected, ...visible])])
          }
        >
          {allVisibleSelected ? "Deselect all" : "Select all"}
        </button>
      )}
    </>
  );
}

/** The bottom action bar while selecting: what's picked (as logos), "Save as set" so a whole
 *  setup can be restored in one click after the next wipe, and "Download N". */
export function SelectionActionBar() {
  const selectMode = useCatalogStore((s) => s.selectMode);
  const setSelectMode = useCatalogStore((s) => s.setSelectMode);
  const category = useCatalogStore((s) => s.selectedCategoryId);
  const osFilter = useCatalogStore((s) => s.osFilter);
  const catalog = useCatalogStore((s) => s.catalog);
  const selected = useSelectionStore((s) => s.selected);
  const clear = useSelectionStore((s) => s.clear);
  const specialsSelected = useSpecialsSelectionStore((s) => s.selected);
  const clearSpecials = useSpecialsSelectionStore((s) => s.clear);
  const groups = useSpecialsContentStore((s) => s.groups);
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const signedIn = useAccountStore((s) => s.user !== null);
  const openSaveSet = useSaveSetDialog((s) => s.open);
  const openAccount = useAccountDialog((s) => s.open);
  const inSpecials = category === SPECIALS_CATEGORY_ID;

  const apps = catalog ? catalog.categories.flatMap((c) => c.apps) : [];
  const picked = selected.map((id) => apps.find((a) => a.id === id)).filter((a) => !!a);
  const count = inSpecials ? specialsSelected.length : selected.length;

  async function download() {
    if (inSpecials) {
      const items = groups.flatMap(flattenGroup).filter((i) => specialsSelected.includes(i.objectKey));
      for (const item of items) {
        try {
          await startSpecialsDownload(item.objectKey, item.name, gatedUrl(item.objectKey, sessionKey), item.filename, item.sha256);
        } catch {
          // Per-item failures surface on their own card.
        }
      }
      clearSpecials();
    } else {
      for (const id of selected) {
        try {
          await startDownload(id, osFilter);
        } catch {
          // Per-app failures surface on their own rows.
        }
      }
      clear();
    }
    setSelectMode(false);
  }

  return (
    <AnimatePresence>
      {selectMode && (
        <motion.div
          className="selection-actions"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        >
          {!inSpecials && (
            <div className="selection-actions__stack" aria-hidden="true">
              {picked.slice(0, 5).map((app) => (
                <AppIcon key={app.id} appId={app.id} name={app.name} domain={app.domain} className="selection-actions__icon" />
              ))}
              {picked.length > 5 && <span className="selection-actions__more">+{picked.length - 5}</span>}
            </div>
          )}
          <span className="selection-actions__spacer" />
          {!inSpecials && (
            <button
              className="selection-actions__btn"
              disabled={count === 0}
              onClick={() => (signedIn ? openSaveSet(selected) : openAccount("signIn"))}
              title={signedIn ? "Save these apps as a set on your account" : "Sets sync with a free account"}
            >
              {signedIn ? "Save as set…" : "Sign in to save a set"}
            </button>
          )}
          <button className="selection-actions__btn selection-actions__btn--primary" disabled={count === 0} onClick={() => void download()}>
            Download{count ? ` ${count}` : ""}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
