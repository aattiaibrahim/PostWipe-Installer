import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";
import { useSpecialsContentStore, type SpecialsGroup, type SpecialsSubfolder } from "../state/specialsContentStore";
import { SpecialsItem, tileGradient } from "./SpecialsItem";

/** A nested folder (e.g. Audio & EQ ▸ Sennheiser 650) shown as a cover card on the shelf;
 *  clicking it swaps the shelf to that folder's contents (back chip in the header). */
function FolderCard({ subfolder, onOpen }: { subfolder: SpecialsSubfolder; onOpen: () => void }) {
  return (
    <button className="specials-card specials-card--folder" onClick={onOpen}>
      <div className="specials-card__media" style={{ background: tileGradient(subfolder.name) }}>
        <svg
          className="specials-card__folder-glyph"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        <span className="specials-card__badge">{subfolder.items.length}</span>
      </div>
      <div className="specials-card__body">
        <span className="specials-card__name">{subfolder.name}</span>
        <span className="specials-card__meta">
          {subfolder.items.length} {subfolder.items.length === 1 ? "item" : "items"}
        </span>
      </div>
    </button>
  );
}

/** One category = one umbrel-style shelf: header row, then a horizontally-scrolling rail
 *  of cards. Opening a subfolder swaps the rail to its contents with a back chip. */
function Shelf({ group }: { group: SpecialsGroup }) {
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const folder = group.subfolders.find((s) => s.name === openFolder) ?? null;
  const total = group.items.length + group.subfolders.reduce((n, s) => n + s.items.length, 0);

  return (
    <section className="category-panel__section specials-shelf-section">
      <div className="category-panel__header specials-shelf__header">
        {folder ? (
          <>
            <button className="specials-shelf__back" onClick={() => setOpenFolder(null)} aria-label="Back to all">
              ←
            </button>
            <h2 className="category-panel__title">
              {group.meta.label} <span className="specials-shelf__crumb">▸ {folder.name}</span>
            </h2>
            <span className="specials-group__count">{folder.items.length}</span>
          </>
        ) : (
          <>
            <h2 className="category-panel__title">{group.meta.label}</h2>
            <span className="specials-group__count">{total}</span>
          </>
        )}
      </div>
      {!folder && group.meta.blurb && <p className="specials-group__blurb">{group.meta.blurb}</p>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={folder ? folder.name : "__root__"}
          className="specials-shelf"
          initial={{ opacity: 0, x: folder ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: folder ? -24 : 24 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {folder
            ? folder.items.map((item) => <SpecialsItem key={item.objectKey} item={item} meta={group.meta} />)
            : [
                ...group.subfolders.map((subfolder) => (
                  <FolderCard key={subfolder.name} subfolder={subfolder} onOpen={() => setOpenFolder(subfolder.name)} />
                )),
                ...group.items.map((item) => <SpecialsItem key={item.objectKey} item={item} meta={group.meta} />),
              ]}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/** Rendered in place of the placeholder Specials rows once unlocked: fetches the vault
 *  listing from the Worker and lays each category out as a horizontal gallery shelf. */
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
        <Shelf key={group.folder} group={group} />
      ))}
    </>
  );
}
