import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { Catalog, Os } from "../types/catalog";
import { FAVORITES_CATEGORY_ID } from "../lib/constants";
import { useAccountStore } from "../state/accountStore";
import { useCatalogStore } from "../state/catalogStore";
import { SPECIALS_CATEGORY_ID } from "../state/specialsStore";
import { AppCard } from "./AppCard";
import { AppIcon } from "./AppIcon";
import { PublishVisibleSelectable } from "./SelectMode";
import { setCategoryId } from "./SetPage";

type FavoritesSection = "sets" | "starred";

/** Opens the Favorites page scrolled to one of its sections (the profile panel's tiles). */
export const useFavoritesFocus = create<{
  section: FavoritesSection | null;
  show: (section: FavoritesSection) => void;
  clear: () => void;
}>((set) => ({
  section: null,
  show: (section) => {
    useCatalogStore.getState().setSelectedCategory(FAVORITES_CATEGORY_ID);
    set({ section });
  },
  clear: () => set({ section: null }),
}));

/** Everything the account syncs, in one place: saved sets (whole setups restored in one click)
 *  and individually starred apps. Both follow the account to every PC it signs in on. */
export function FavoritesPage({ catalog, os }: { catalog: Catalog; os: Os }) {
  const user = useAccountStore((s) => s.user);
  const favorites = useAccountStore((s) => s.profile.favorites);
  const sets = useAccountStore((s) => s.profile.sets);
  const setCategory = useCatalogStore((s) => s.setSelectedCategory);
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);

  const allApps = catalog.categories.filter((c) => c.id !== SPECIALS_CATEGORY_ID).flatMap((c) => c.apps);
  const byId = new Map(allApps.map((a) => [a.id, a]));
  const starred = allApps.filter(
    (app) =>
      favorites.includes(app.id) &&
      (app.kind === "link" || !!app.platforms[os]) &&
      !(vendorFilter !== "all" && app.vendor && app.vendor !== vendorFilter),
  );
  const focus = useFavoritesFocus((s) => s.section);
  const clearFocus = useFavoritesFocus((s) => s.clear);
  const setsRef = useRef<HTMLElement>(null);
  const starredRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focus) return;
    (focus === "sets" ? setsRef : starredRef).current?.scrollIntoView({ behavior: "smooth", block: "start" });
    clearFocus();
  }, [focus, clearFocus]);

  const selectable = starred.filter((a) => a.kind === "download" && !!a.platforms[os]?.resolver).map((a) => a.id);

  return (
    <div className="category-panel">
      <PublishVisibleSelectable ids={selectable.join(",")} />
      <header className="store-head">
        <h1 className="store-head__title">Favorites</h1>
        <p className="store-head__sub">
          {sets.length} {sets.length === 1 ? "set" : "sets"} · {starred.length} starred {starred.length === 1 ? "app" : "apps"}
          {user ? ` · synced to ${user.email}` : ""}
        </p>
      </header>

      <section ref={setsRef} className="category-panel__section favorites__section">
        <div className="category-panel__header">
          <h2 className="category-panel__title">Sets</h2>
        </div>
        {sets.length === 0 ? (
          <p className="favorites__hint">
            Save a whole setup as a set: press <strong>Select</strong> in the toolbar, pick apps, then{" "}
            <strong>Save as set</strong>. It restores in one click on any PC you sign in on.
          </p>
        ) : (
          <div className="favorites__sets">
            {sets.map((set) => {
              const ids = (set.apps[os] ?? []).filter((id) => byId.has(id));
              return (
                <button key={set.id} className="set-card" onClick={() => setCategory(setCategoryId(set.id))}>
                  <span className="set-card__stack" aria-hidden="true">
                    {ids.slice(0, 4).map((id) => {
                      const app = byId.get(id)!;
                      return <AppIcon key={id} appId={id} name={app.name} domain={app.domain} className="set-card__icon" />;
                    })}
                  </span>
                  <span className="set-card__text">
                    <strong>{set.name}</strong>
                    <span>
                      {ids.length} {ids.length === 1 ? "app" : "apps"} for {os === "windows" ? "Windows" : "macOS"}
                    </span>
                  </span>
                  <svg className="set-card__chev" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section ref={starredRef} className="category-panel__section favorites__section">
        <div className="category-panel__header">
          <h2 className="category-panel__title">Starred apps</h2>
        </div>
        {starred.length === 0 ? (
          <p className="favorites__hint">Star an app with ☆ and it shows up here on every PC you sign in on.</p>
        ) : (
          <div className="category-panel__rows">
            {starred.map((app) => (
              <AppCard key={app.id} app={app} os={os} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
