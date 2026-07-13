import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";
import {
  useSpecialsContentStore,
  type SpecialsGroup,
  type SpecialsItem as Item,
  type SpecialsSubfolder,
} from "../state/specialsContentStore";
import type { SpecialsCategoryMeta } from "../lib/specialsConfig";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";
import { SpecialsCard, tileGradient } from "./SpecialsCard";
import { resolvePreviews } from "../lib/specialsPreview";
import { SpecialsDetail } from "./SpecialsDetail";

/** Up to four preview images pulled from a set of items, for a cover collage. */
function collageImages(items: Item[], sessionKey: string | null): string[] {
  const out: string[] = [];
  for (const it of items) {
    const p = resolvePreviews(it, sessionKey)[0];
    if (p) out.push(p);
    if (out.length === 4) break;
  }
  return out;
}

/** A big department cover: a 2×2 collage (real previews where available, gradient tiles to
 *  fill) with the name + count. Clicking opens that category / subfolder as its own grid. */
function CoverCard({
  title,
  count,
  images,
  seed,
  folder,
  onOpen,
}: {
  title: string;
  count: number;
  images: string[];
  seed: string;
  folder?: boolean;
  onOpen: () => void;
}) {
  const cells = Array.from({ length: 4 }, (_, i) => images[i] ?? null);
  return (
    <button className="specials-cover" onClick={onOpen}>
      <div className="specials-cover__collage">
        {cells.map((url, i) =>
          url ? (
            <img key={i} src={url} alt="" loading="lazy" />
          ) : (
            <span key={i} style={{ background: tileGradient(seed + i) }} />
          ),
        )}
      </div>
      {folder && (
        <svg className="specials-cover__folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      )}
      <div className="specials-cover__label">
        <span className="specials-cover__name">{title}</span>
        <span className="specials-cover__count">{count} {count === 1 ? "item" : "items"}</span>
      </div>
    </button>
  );
}

/** A grid of item cards + (optionally) subfolder covers, with a back header. */
function ItemGrid({
  title,
  crumb,
  items,
  subfolders,
  meta,
  onBack,
  onOpenSub,
  onOpenItem,
}: {
  title: string;
  crumb?: string;
  items: Item[];
  subfolders: SpecialsSubfolder[];
  meta: SpecialsCategoryMeta;
  onBack: () => void;
  onOpenSub: (name: string) => void;
  onOpenItem: (item: Item) => void;
}) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const selecting = useSpecialsSelectionStore((s) => s.selected.length > 0);
  return (
    <motion.div
      className="specials-page"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="specials-page__header">
        <button className="specials-page__back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h2 className="specials-page__title">
          {title}
          {crumb && <span className="specials-page__crumb"> ▸ {crumb}</span>}
        </h2>
      </div>
      {meta.blurb && !crumb && <p className="specials-page__blurb">{meta.blurb}</p>}
      <div className={`specials-grid${selecting ? " specials-grid--selecting" : ""}`}>
        {subfolders.map((sf) => (
          <CoverCard
            key={sf.name}
            title={sf.name}
            count={sf.items.length}
            images={collageImages(sf.items, sessionKey)}
            seed={sf.name}
            folder
            onOpen={() => onOpenSub(sf.name)}
          />
        ))}
        {items.map((item) => (
          <SpecialsCard key={item.objectKey} item={item} onOpen={onOpenItem} />
        ))}
      </div>
    </motion.div>
  );
}

/** Rendered once the vault is unlocked: a landing grid of category covers → each opens that
 *  category as its own grid → clicking an item opens the detail sheet. Pure vertical scroll. */
export function SpecialsContent() {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const { loaded, loading, error, groups, load } = useSpecialsContentStore();

  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ item: Item; meta: SpecialsCategoryMeta } | null>(null);

  useEffect(() => {
    if (sessionKey && !loaded && !loading) load(sessionKey);
  }, [sessionKey, loaded, loading, load]);

  if (loading && !loaded) return <p className="category-panel__empty">Loading the vault…</p>;
  if (error) return <p className="category-panel__empty">Couldn't load the vault: {error}</p>;

  const group: SpecialsGroup | undefined = groups.find((g) => g.folder === openFolder);
  const subfolder = group?.subfolders.find((s) => s.name === openSub);

  return (
    <>
      <AnimatePresence mode="wait">
        {!group ? (
          <motion.div
            key="__root__"
            className="specials-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="specials-grid specials-grid--covers">
              {groups.map((g) => {
                const allItems = [...g.items, ...g.subfolders.flatMap((s) => s.items)];
                const count = allItems.length;
                return (
                  <CoverCard
                    key={g.folder}
                    title={g.meta.label}
                    count={count}
                    images={collageImages(allItems, sessionKey)}
                    seed={g.folder}
                    onOpen={() => {
                      setOpenFolder(g.folder);
                      setOpenSub(null);
                    }}
                  />
                );
              })}
            </div>
          </motion.div>
        ) : subfolder ? (
          <ItemGrid
            key={`${group.folder}/${subfolder.name}`}
            title={group.meta.label}
            crumb={subfolder.name}
            items={subfolder.items}
            subfolders={[]}
            meta={group.meta}
            onBack={() => setOpenSub(null)}
            onOpenSub={() => {}}
            onOpenItem={(item) => setDetail({ item, meta: group.meta })}
          />
        ) : (
          <ItemGrid
            key={group.folder}
            title={group.meta.label}
            items={group.items}
            subfolders={group.subfolders}
            meta={group.meta}
            onBack={() => setOpenFolder(null)}
            onOpenSub={(name) => setOpenSub(name)}
            onOpenItem={(item) => setDetail({ item, meta: group.meta })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detail && <SpecialsDetail item={detail.item} meta={detail.meta} onClose={() => setDetail(null)} />}
      </AnimatePresence>
    </>
  );
}
