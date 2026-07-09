import { useEffect } from "react";
import { useSpecialsStore } from "../state/specialsStore";
import { useSpecialsContentStore } from "../state/specialsContentStore";
import { SpecialsItem } from "./SpecialsItem";

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
            <span className="specials-group__count">{group.items.length}</span>
          </div>
          {group.meta.blurb && <p className="specials-group__blurb">{group.meta.blurb}</p>}
          <div className="specials-group__items">
            {group.items.map((item) => (
              <SpecialsItem key={item.objectKey} item={item} meta={group.meta} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
