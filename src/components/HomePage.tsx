import { memo, useMemo, type CSSProperties } from "react";
import type { AppEntry, Catalog, Os } from "../types/catalog";
import { ESSENTIAL_APP_IDS } from "../lib/constants";
import { categoryColor } from "../lib/categoryColors";
import { CategoryIcon } from "../lib/categoryIcons";
import { installKind } from "../lib/installKind";
import { SPECIALS_CATEGORY_ID } from "../state/specialsStore";
import { useCatalogStore } from "../state/catalogStore";
import { useSelectionStore } from "../state/selectionStore";
import { useAccountStore } from "../state/accountStore";
import { AppIcon } from "./AppIcon";
import { useKickstart } from "./KickstartDialog";
import { PublishVisibleSelectable } from "./SelectMode";
import { setCategoryId } from "./SetPage";

/** Something Discover can put a checkbox on: a real download for this OS. */
const pickable = (app: AppEntry, os: Os) => app.kind === "download" && !!app.platforms[os]?.resolver;

/** One Ninite row: checkbox, small logo, name. The whole row toggles the pick. */
function PickRow({ app, os, checked }: { app: AppEntry; os: Os; checked: boolean }) {
  const toggle = useSelectionStore((s) => s.toggle);
  const setSelectMode = useCatalogStore((s) => s.setSelectMode);
  const kind = installKind(app, os);
  return (
    <label className={`pick-row${checked ? " pick-row--on" : ""}`} title={app.bio ?? app.name}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {
          toggle(app.id);
          // Checking something here brings up the bottom bar (Download N / Save as set).
          setSelectMode(true);
        }}
      />
      <AppIcon appId={app.id} name={app.name} domain={app.domain} className="pick-row__icon" />
      <span className="pick-row__name">{app.name}</span>
      {kind === "manual" && (
        <span className="pick-row__tag" title="Has only its own click-through installer: Install all at once downloads it and leaves it for you to run">
          manual
        </span>
      )}
    </label>
  );
}

/** Discover, the Ninite way: every app on one page as a compact checklist grouped by category.
 *  Pick what you want, then install it all at once from the bar at the bottom. */
export const HomePage = memo(function HomePage({ catalog, os }: { catalog: Catalog; os: Os }) {
  const setCategory = useCatalogStore((s) => s.setSelectedCategory);
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);
  const selected = useSelectionStore((s) => s.selected);
  const replaceSelection = useSelectionStore((s) => s.replace);
  const user = useAccountStore((s) => s.user);
  const sets = useAccountStore((s) => s.profile.sets);
  const showKickstart = useKickstart((s) => s.show);

  const groups = useMemo(
    () =>
      catalog.categories
        .filter((c) => c.id !== SPECIALS_CATEGORY_ID)
        .map((c) => ({
          category: c,
          apps: c.apps.filter(
            (a) => pickable(a, os) && !(vendorFilter !== "all" && a.vendor && a.vendor !== vendorFilter),
          ),
        }))
        .filter((g) => g.apps.length > 0),
    [catalog, os, vendorFilter],
  );
  const allIds = groups.flatMap((g) => g.apps.map((a) => a.id));
  const essentials = ESSENTIAL_APP_IDS.filter((id) => allIds.includes(id));
  const chosen = new Set(selected);
  const osName = os === "windows" ? "Windows" : "macOS";

  return (
    <div className="home home--ninite">
      <PublishVisibleSelectable ids={allIds.join(",")} />
      <header className="store-head">
        <h1 className="store-head__title">Discover</h1>
        <p className="store-head__sub">
          Pick the apps you want, then {os === "windows" ? "install them all at once. No toolbars, no clicking Next." : "download them in one go."}
        </p>
      </header>

      <section className="home-strip">
        <span className="home-strip__text">
          <strong>Fresh wipe?</strong> Kickstart picks the right {osName} apps from a few questions.
        </span>
        <button className="home-strip__btn home-strip__btn--primary" onClick={showKickstart}>
          ⚡ Kickstart
        </button>
        <button className="home-strip__btn" onClick={() => replaceSelection(essentials)}>
          Pick {essentials.length} essentials
        </button>
        {user &&
          sets.map((set) => (
            <button key={set.id} className="home-strip__btn home-strip__btn--set" onClick={() => setCategory(setCategoryId(set.id))}>
              {set.name} <span>{(set.apps[os] ?? []).length}</span>
            </button>
          ))}
      </section>

      <div className="pick-grid">
        {groups.map(({ category, apps }) => (
          <section key={category.id} className="pick-group" style={{ "--cat-color": categoryColor(category.id) } as CSSProperties}>
            <h2 className="pick-group__title">
              <button onClick={() => setCategory(category.id)} title={`Open ${category.name}`}>
                <CategoryIcon categoryId={category.id} className="pick-group__icon" />
                {category.name}
              </button>
            </h2>
            {apps.map((app) => (
              <PickRow key={app.id} app={app} os={os} checked={chosen.has(app.id)} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
});
