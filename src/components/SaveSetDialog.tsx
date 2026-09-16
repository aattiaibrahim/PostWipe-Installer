import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import type { Os } from "../types/catalog";
import { useAccountStore } from "../state/accountStore";
import { useCatalogStore } from "../state/catalogStore";

interface SaveSetState {
  appIds: string[] | null;
  open: (appIds: string[]) => void;
  close: () => void;
}

export const useSaveSetDialog = create<SaveSetState>((set) => ({
  appIds: null,
  open: (appIds) => set({ appIds }),
  close: () => set({ appIds: null }),
}));

/** Names the current selection and stores it as a set on the account. The set records the
 *  picks for BOTH platforms, so a set saved on a Windows PC still loads the right Mac apps. */
export function SaveSetDialog() {
  const appIds = useSaveSetDialog((s) => s.appIds);
  const close = useSaveSetDialog((s) => s.close);
  const catalog = useCatalogStore((s) => s.catalog);
  const sets = useAccountStore((s) => s.profile.sets);
  const saveSet = useAccountStore((s) => s.saveSet);
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!appIds) return;
    setName("");
    requestAnimationFrame(() => input.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appIds, close]);

  const replacing = sets.some((s) => s.name.toLowerCase() === name.trim().toLowerCase());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!appIds || !catalog || !name.trim()) return;
    const apps = catalog.categories.flatMap((c) => c.apps).filter((a) => appIds.includes(a.id));
    const on = (os: Os) => apps.filter((a) => !!a.platforms[os]).map((a) => a.id);
    saveSet(name, { windows: on("windows"), macos: on("macos") });
    close();
  }

  return createPortal(
    <AnimatePresence>
      {appIds && (
        <motion.div className="confirm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.form
            className="confirm-dialog account-dialog"
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
          >
            <h3 className="confirm-dialog__title">Save {appIds.length} apps as a set</h3>
            <p className="account-lede">Load it from the sidebar on any PC you sign in on.</p>
            <label className="account-field" htmlFor="set-name">
              <span className="account-field__label">Name</span>
              <input
                ref={input}
                id="set-name"
                maxLength={60}
                placeholder="Gaming rig"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {replacing && <span className="account-field__hint">Replaces your existing set with this name.</span>}
            </label>
            <div className="confirm-dialog__actions">
              <button type="button" className="confirm-dialog__btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="account-primary account-primary--small" disabled={!name.trim()}>
                {replacing ? "Replace set" : "Save set"}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
