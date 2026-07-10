import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";
import { useSpecialsContentStore, type SpecialsSubfolder } from "../state/specialsContentStore";
import type { SpecialsCategoryMeta } from "../lib/specialsConfig";
import { SpecialsItem } from "./SpecialsItem";

/** A nested folder (e.g. Audio & EQ ▸ Sennheiser 650) rendered as one entry that expands
 *  to all of its files. */
function SubfolderRow({ subfolder, meta }: { subfolder: SpecialsSubfolder; meta: SpecialsCategoryMeta }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="specials-folder">
      <button className="specials-folder__head" onClick={() => setOpen((o) => !o)}>
        <svg
          className="specials-folder__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        <span className="specials-folder__name">{subfolder.name}</span>
        <span className="specials-group__count">{subfolder.items.length}</span>
        <motion.svg
          className="specials-folder__chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          <path d="M9 6l6 6-6 6" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="specials-folder__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            style={{ overflow: "hidden" }}
          >
            <div className="specials-group__items specials-folder__items">
              {subfolder.items.map((item) => (
                <SpecialsItem key={item.objectKey} item={item} meta={meta} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Rendered in place of the placeholder Specials rows once unlocked: fetches the vault
 *  listing from the Worker and groups it into sub-sections (Cursor Packs, Fonts, …). */
export function SpecialsContent() {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const { loaded, loading, error, groups, load } = useSpecialsContentStore();

  useEffect(() => {
    if (sessionKey && !loaded && !loading) load(sessionKey);
  }, [sessionKey, loaded, loading, load]);

  if (loading && !loaded) {
    return <p className="category-panel__empty">Loading the vault…</p>;
  }
  if (error) {
    return <p className="category-panel__empty">Couldn't load the vault: {error}</p>;
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.folder} className="category-panel__section">
          <div className="category-panel__header">
            <h2 className="category-panel__title">{group.meta.label}</h2>
            <span className="specials-group__count">
              {group.items.length + group.subfolders.reduce((n, s) => n + s.items.length, 0)}
            </span>
          </div>
          {group.meta.blurb && <p className="specials-group__blurb">{group.meta.blurb}</p>}
          <div className="specials-group__items">
            {group.subfolders.map((subfolder) => (
              <SubfolderRow key={subfolder.name} subfolder={subfolder} meta={group.meta} />
            ))}
            {group.items.map((item) => (
              <SpecialsItem key={item.objectKey} item={item} meta={group.meta} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
