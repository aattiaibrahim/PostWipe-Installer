import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";
import {
  useSpecialsContentStore,
  flattenGroup,
  flattenSubfolder,
  type SpecialsGroup,
  type SpecialsItem as Item,
  type SpecialsSubfolder,
} from "../state/specialsContentStore";
import type { SpecialsCategoryMeta } from "../lib/specialsConfig";
import { useCatalogStore } from "../state/catalogStore";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";

// On macOS only these vault categories are relevant (the rest are Windows-only: cursors,
// sounds, themes, the programs folders). Everything shows on Windows.
const MAC_FOLDERS = new Set(["PSD's", "Steam Profiles", "Fonts", "Wallpapers & Profile Pics"]);
import { SpecialsCard, tileGradient } from "./SpecialsCard";
import { resolvePreviews, categoryHeroImage, folderCoverImage } from "../lib/specialsPreview";
import { SpecialsDetail } from "./SpecialsDetail";
import { MusicGlyph } from "./MusicGlyph";

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

/** A big department cover. When every item resolves to the SAME art (PSD's → Ps tile, Payday →
 *  composite, Audio & EQ → Sennheiser, Windows Themes → tile) it fills the whole card with that
 *  one image; a sound category with no art fills with a music note; otherwise a 2×2 collage of
 *  the distinct thumbnails. Clicking opens that category / subfolder as its own grid. */
function CoverCard({
  title,
  count,
  images,
  seed,
  folder,
  sound,
  imageOnly,
  coverImage,
  onOpen,
}: {
  title: string;
  count: number;
  images: string[];
  seed: string;
  folder?: boolean;
  sound?: boolean;
  imageOnly?: boolean;
  coverImage?: string | null;
  onOpen: () => void;
}) {
  // An explicit folder cover (Sennheiser 650 → headphones) always wins over the collage —
  // the art belongs to the folder, not to each file inside it.
  const unique = coverImage ? [coverImage] : [...new Set(images)];
  return (
    <button className={`specials-cover${imageOnly ? " specials-cover--image-only" : ""}`} onClick={onOpen} aria-label={title}>
      {unique.length === 1 ? (
        <img className="specials-cover__fill" src={unique[0]} alt="" loading="lazy" />
      ) : unique.length === 0 && sound ? (
        <div className="specials-cover__fill specials-cover__glyph-fill" style={{ background: tileGradient(seed) }}>
          <MusicGlyph className="specials-cover__music" />
        </div>
      ) : (
        <div className="specials-cover__collage">
          {Array.from({ length: 4 }, (_, i) => unique[i] ?? null).map((url, i) =>
            url ? (
              <img key={i} src={url} alt="" loading="lazy" />
            ) : (
              <span key={i} style={{ background: tileGradient(seed + i) }} />
            ),
          )}
        </div>
      )}
      {folder && !imageOnly && (
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

/** A grid of item cards + subfolder covers for the current tree node, with a back header
 *  and a breadcrumb of the nested path. */
function ItemGrid({
  title,
  crumbs,
  items,
  subfolders,
  meta,
  hero,
  onBack,
  onOpenSub,
  onOpenItem,
}: {
  title: string;
  crumbs: string[];
  items: Item[];
  subfolders: SpecialsSubfolder[];
  meta: SpecialsCategoryMeta;
  hero: string | null;
  onBack: () => void;
  onOpenSub: (name: string) => void;
  onOpenItem: (item: Item) => void;
}) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const hasSelection = useSpecialsSelectionStore((s) => s.selected.length > 0);
  const selectMode = useCatalogStore((s) => s.selectMode);
  const selecting = hasSelection || selectMode;
  const atRoot = crumbs.length === 0;
  return (
    <motion.div
      className="specials-page"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {/* The WHOLE frosted bar is the back control, not just the little arrow. */}
      <div
        className="specials-page__header specials-page__header--clickable"
        onClick={onBack}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onBack();
          }
        }}
        aria-label="Back"
      >
        <span className="specials-page__back" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m14.5 5-7 7 7 7" />
          </svg>
        </span>
        <h2 className="specials-page__title">
          {title}
          {crumbs.map((c) => (
            <span key={c} className="specials-page__crumb"> ▸ {c}</span>
          ))}
        </h2>
      </div>
      {hero && atRoot && <img className="specials-page__hero" src={hero} alt={title} />}
      {meta.blurb && atRoot && <p className="specials-page__blurb">{meta.blurb}</p>}
      <div className={`specials-grid${selecting ? " specials-grid--selecting" : ""}`}>
        {subfolders.map((sf) => {
          const all = flattenSubfolder(sf);
          return (
            <CoverCard
              key={sf.name}
              title={sf.name}
              count={all.length}
              images={collageImages(all, sessionKey)}
              seed={sf.name}
              folder
              coverImage={folderCoverImage(sf.name)}
              sound={meta.install === "sound"}
              imageOnly={title === "Programs" && /^(adobe|general)(?: programs)?$/i.test(sf.name)}
              onOpen={() => onOpenSub(sf.name)}
            />
          );
        })}
        {items.map((item) => (
          <SpecialsCard key={item.objectKey} item={item} onOpen={onOpenItem} />
        ))}
      </div>
    </motion.div>
  );
}

/** Rendered once the vault is unlocked: a landing grid of category covers → each opens that
 *  category as its own grid → nested folders drill deeper (breadcrumb + back) → clicking an
 *  item opens the detail sheet. Pure vertical scroll. */
export function SpecialsContent() {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const osFilter = useCatalogStore((s) => s.osFilter);
  const { loaded, loading, error, groups: allGroups, load } = useSpecialsContentStore();
  const groups = osFilter === "macos" ? allGroups.filter((g) => MAC_FOLDERS.has(g.folder)) : allGroups;

  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [subPath, setSubPath] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ item: Item; meta: SpecialsCategoryMeta } | null>(null);

  useEffect(() => {
    if (sessionKey && !loaded && !loading) load(sessionKey);
  }, [sessionKey, loaded, loading, load]);

  if (loading && !loaded) return <p className="category-panel__empty">Loading the vault…</p>;
  if (error) return <p className="category-panel__empty">Couldn't load the vault: {error}</p>;

  const group: SpecialsGroup | undefined = groups.find((g) => g.folder === openFolder);

  // Walk the nested path from the category root to the node we're viewing.
  let items = group?.items ?? [];
  let subfolders = group?.subfolders ?? [];
  const crumbs: string[] = [];
  if (group) {
    for (const seg of subPath) {
      const next = subfolders.find((s) => s.name === seg);
      if (!next) break;
      crumbs.push(seg);
      items = next.items;
      subfolders = next.subfolders;
    }
  }

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
                const all = flattenGroup(g);
                return (
                  <CoverCard
                    key={g.folder}
                    title={g.meta.label}
                    count={all.length}
                    images={collageImages(all, sessionKey)}
                    seed={g.folder}
                    coverImage={folderCoverImage(g.folder)}
                    sound={g.meta.install === "sound"}
                    onOpen={() => {
                      setOpenFolder(g.folder);
                      setSubPath([]);
                    }}
                  />
                );
              })}
            </div>
          </motion.div>
        ) : (
          <ItemGrid
            key={`${group.folder}/${crumbs.join("/")}`}
            title={group.meta.label}
            crumbs={crumbs}
            items={items}
            subfolders={subfolders}
            meta={group.meta}
            hero={categoryHeroImage(group.folder)}
            onBack={() => {
              if (subPath.length > 0) setSubPath(subPath.slice(0, -1));
              else setOpenFolder(null);
            }}
            onOpenSub={(name) => setSubPath([...subPath, name])}
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
