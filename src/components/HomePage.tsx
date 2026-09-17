import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppEntry, Catalog, Os } from "../types/catalog";
import { ALL_CATEGORY_ID, ESSENTIAL_APP_IDS, RECENTLY_ADDED_APP_IDS } from "../lib/constants";
import { isTauri, startDownload, statsPopular, type PopularApp } from "../lib/tauriCommands";
import { SPECIALS_CATEGORY_ID } from "../state/specialsStore";
import { useCatalogStore } from "../state/catalogStore";
import { useSelectionStore } from "../state/selectionStore";
import { useAccountStore } from "../state/accountStore";
import { useEntryHealth } from "../state/healthStore";
import { AppIcon } from "./AppIcon";
import { useKickstart } from "./KickstartDialog";

interface Located {
  app: AppEntry;
  categoryId: string;
  categoryName: string;
}

/** Whether an entry means anything on this OS. Bookmarks have no platforms and work anywhere. */
const availableOn = (app: AppEntry, os: Os) => app.kind === "link" || !!app.platforms[os];

function openExternal(url: string) {
  if (isTauri) openUrl(url).catch(() => {});
  else window.open(url, "_blank");
}

/** One storefront tile. The button does the obvious thing for the entry's kind; clicking the
 *  tile itself jumps to the app's category, where its description and guide live. */
function Tile({ item, os, meta }: { item: Located; os: Os; meta?: ReactNode }) {
  const { app } = item;
  const setCategory = useCatalogStore((s) => s.setSelectedCategory);
  const health = useEntryHealth(app.id, os);
  const [queued, setQueued] = useState(false);
  const platform = app.platforms[os];
  const siteUrl = app.website ?? (app.domain ? `https://${app.domain}` : null);

  let action: { label: string; run: () => void; title?: string } | null = null;
  if (app.kind === "link" && siteUrl) {
    action = { label: "Open ↗", run: () => openExternal(siteUrl) };
  } else if (app.kind === "download" && platform?.resolver) {
    action = {
      label: queued ? "Queued ✓" : "Get",
      run: () => {
        if (queued) return;
        setQueued(true);
        startDownload(app.id, os).catch(() => setQueued(false));
      },
      title: health?.status === "broken" ? `Last check failed: ${health.detail}` : "Download to PostWipeDownloads",
    };
  } else if (app.kind === "download" && siteUrl) {
    action = { label: "Site ↗", run: () => openExternal(siteUrl), title: "This vendor blocks direct downloads" };
  }

  return (
    <article className="home-tile" onClick={() => setCategory(item.categoryId)} title={`${app.name} — show in ${item.categoryName}`}>
      <AppIcon appId={app.id} name={app.name} domain={app.domain} className="home-tile__icon" />
      <div className="home-tile__text">
        <h4 className="home-tile__name">{app.name}</h4>
        <span className="home-tile__meta">{meta ?? (app.bio || item.categoryName)}</span>
      </div>
      {action && (
        <button
          className={`home-tile__get${health?.status === "broken" ? " home-tile__get--risky" : ""}${queued ? " home-tile__get--done" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            action.run();
          }}
          title={action.title}
        >
          {action.label}
        </button>
      )}
    </article>
  );
}

/** `empty` replaces the tile row entirely: inside the row, a message would be squeezed into
 *  one tile-width grid column. */
function Shelf({
  title,
  subtitle,
  children,
  action,
  empty,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  action?: ReactNode;
  empty?: string | null;
}) {
  return (
    <section className="home-shelf">
      <header className="home-shelf__head">
        <div>
          <h2 className="home-shelf__title">{title}</h2>
          {subtitle && <p className="home-shelf__subtitle">{subtitle}</p>}
        </div>
        {action}
      </header>
      {empty ? <p className="home-shelf__empty">{empty}</p> : <div className="home-shelf__row">{children}</div>}
    </section>
  );
}

/** The storefront landing page: a starting point for a fresh wipe, what the community actually
 *  downloads, a curated essentials list, and — when signed in — your own favorites and sets. */
export const HomePage = memo(function HomePage({ catalog, os }: { catalog: Catalog; os: Os }) {
  const setCategory = useCatalogStore((s) => s.setSelectedCategory);
  const replaceSelection = useSelectionStore((s) => s.replace);
  const user = useAccountStore((s) => s.user);
  const favorites = useAccountStore((s) => s.profile.favorites);
  const sets = useAccountStore((s) => s.profile.sets);
  const openAccount = useCatalogStore((s) => s.setDockView);
  const showKickstart = useKickstart((s) => s.show);

  const index = useMemo(() => {
    const map = new Map<string, Located>();
    for (const category of catalog.categories) {
      if (category.id === SPECIALS_CATEGORY_ID) continue;
      for (const app of category.apps) map.set(app.id, { app, categoryId: category.id, categoryName: category.name });
    }
    return map;
  }, [catalog]);

  const pick = (ids: string[], limit = 12) =>
    ids
      .map((id) => index.get(id))
      .filter((item): item is Located => !!item && availableOn(item.app, os))
      .slice(0, limit);

  const [popular, setPopular] = useState<PopularApp[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPopular(null);
    void statsPopular(os).then((apps) => !cancelled && setPopular(apps));
    return () => {
      cancelled = true;
    };
  }, [os]);

  const essentials = pick(ESSENTIAL_APP_IDS);
  const recent = pick(RECENTLY_ADDED_APP_IDS, 10);
  const favoriteItems = pick(favorites, 24);
  const popularItems = (popular ?? [])
    .map((p) => ({ item: index.get(p.appId), count: p.count }))
    .filter((p): p is { item: Located; count: number } => !!p.item && availableOn(p.item.app, os));
  const appCount = [...index.values()].filter((l) => l.app.kind !== "link" && availableOn(l.app, os)).length;
  const osName = os === "windows" ? "Windows" : "macOS";
  const downloadable = essentials.filter((e) => e.app.kind === "download" && e.app.platforms[os]?.resolver);

  return (
    <div className="home">
      <header className="store-head">
        <h1 className="store-head__title">Discover</h1>
        <p className="store-head__sub">Everything you need after a fresh wipe, checked every week.</p>
      </header>
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="home-hero__eyebrow">Kickstart</p>
          <h2 className="home-hero__title">Fresh wipe? Get your {osName} setup back in minutes.</h2>
          <p className="home-hero__lede">
            {appCount} apps, each download checked every week. Answer a few questions and Kickstart picks the right ones for you.
          </p>
          <div className="home-hero__actions">
            <button className="home-hero__primary home-hero__kickstart" onClick={showKickstart}>
              <span aria-hidden="true">⚡</span> Kickstart my setup
            </button>
            <button className="home-hero__secondary" onClick={() => replaceSelection(downloadable.map((e) => e.app.id))}>
              Select {downloadable.length} essentials
            </button>
          </div>
        </div>
        <div className="home-hero__stack" aria-hidden="true">
          {essentials.slice(0, 6).map((e) => (
            <AppIcon key={e.app.id} appId={e.app.id} name={e.app.name} domain={e.app.domain} className="home-hero__icon" />
          ))}
        </div>
      </section>

      {user && sets.length > 0 && (
        <section className="home-sets">
          <span className="home-sets__label">Your sets</span>
          {sets.map((set) => {
            const apps = set.apps[os] ?? [];
            return (
              <button key={set.id} className="home-sets__chip" disabled={!apps.length} onClick={() => replaceSelection(apps)}>
                {set.name} <span>{apps.length}</span>
              </button>
            );
          })}
        </section>
      )}

      <Shelf
        title="Popular with the community"
        subtitle={`Most downloaded on ${osName}, all time`}
        empty={
          popular !== null && popularItems.length === 0
            ? "Not enough downloads counted yet — this fills in as people use PostWipe. You can opt out of counting in Settings."
            : null
        }
      >
        {popular === null
          ? Array.from({ length: 5 }, (_, i) => <div key={i} className="home-tile home-tile--skeleton" />)
          : popularItems.map(({ item, count }, i) => (
              <Tile key={item.app.id} item={item} os={os} meta={<>#{i + 1} · {count.toLocaleString()} downloads</>} />
            ))}
      </Shelf>

      <Shelf
        title="Essentials"
        subtitle="What most setups reinstall first"
        action={
          <button className="store-see-all" onClick={() => setCategory(ALL_CATEGORY_ID)}>
            See All
          </button>
        }
      >
        {essentials.map((item) => (
          <Tile key={item.app.id} item={item} os={os} />
        ))}
      </Shelf>

      {user ? (
        <Shelf
          title="Your favorites"
          subtitle={favoriteItems.length ? `Synced to ${user.email}` : undefined}
          empty={favoriteItems.length ? null : "Star apps with ☆ in any category and they'll collect here, on every PC you sign in on."}
          action={
            favoriteItems.some((f) => f.app.kind === "download") ? (
              <button
                className="home-shelf__link"
                onClick={() =>
                  replaceSelection(favoriteItems.filter((f) => f.app.kind === "download" && f.app.platforms[os]?.resolver).map((f) => f.app.id))
                }
              >
                Select all
              </button>
            ) : undefined
          }
        >
          {favoriteItems.map((item) => (
            <Tile key={item.app.id} item={item} os={os} />
          ))}
        </Shelf>
      ) : (
        <section className="home-signin">
          <div>
            <h3 className="home-shelf__title">Keep your picks for next time</h3>
            <p className="home-shelf__subtitle">
              A free account saves favorites and sets of apps, so your next wipe is a single click.
            </p>
          </div>
          <button className="home-hero__secondary" onClick={() => openAccount("account")}>
            Create account
          </button>
        </section>
      )}

      <Shelf title="Recently added">
        {recent.map((item) => (
          <Tile key={item.app.id} item={item} os={os} />
        ))}
      </Shelf>
    </div>
  );
});
