import type { AppEntry, Os } from "../types/catalog";

interface AppCardProps {
  app: AppEntry;
  os: Os;
}

export function AppCard({ app, os }: AppCardProps) {
  const platform = app.platforms[os];
  if (!platform) return null;

  const actionLabel = app.kind === "script" ? "Generate Script" : "Download";

  return (
    <div className="app-card">
      <div className="app-card__header">
        <img
          className="app-card__icon"
          src={`/icons/${app.icon}`}
          alt=""
          onError={(e) => {
            e.currentTarget.src = "/icons/placeholder.svg";
          }}
        />
        <span className="app-card__name" title={app.name}>
          {app.name}
        </span>
      </div>
      {platform.stale && (
        <span className="badge badge--stale" title={app.notes ?? "Needs verification"}>
          needs check
        </span>
      )}
      {app.notes && <p className="app-card__notes">{app.notes}</p>}
      <button className="app-card__action" disabled title="Download manager arrives in the next milestone">
        {actionLabel}
      </button>
    </div>
  );
}
