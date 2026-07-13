import type { SpecialsItem as Item } from "../state/specialsContentStore";
import { useSpecialsStore } from "../state/specialsStore";
import { useSpecialsSelectionStore } from "../state/specialsSelectionStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { resolvePreviews } from "../lib/specialsPreview";

// Re-exported so existing imports (`from "./SpecialsCard"`) keep working.
export { gatedUrl } from "../lib/specialsPreview";

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Deterministic per-name gradient for cards/covers with no preview image. */
export function tileGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  return `linear-gradient(135deg, hsl(${hue} 48% 38%), hsl(${(hue + 46) % 360} 55% 22%))`;
}

/** A single vault item as a gallery tile: preview art (or a gradient glyph tile) with the
 *  name/size beneath. Clicking opens the detail sheet — actions live there, not on the card. */
export function SpecialsCard({ item, onOpen }: { item: Item; onOpen: (item: Item) => void }) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const selected = useSpecialsSelectionStore((s) => s.selected.includes(item.objectKey));
  const toggleSelected = useSpecialsSelectionStore((s) => s.toggle);

  const job = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === item.objectKey);
  const downloading = !!job && ACTIVE_STATUSES.has(job.status);
  const downloaded = job?.status === "completed";
  const percent = job?.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;

  const previews = resolvePreviews(item, sessionKey);
  const hasSound = item.audioPreviews.length > 0;
  const firstImage = previews[0] ?? null;

  return (
    <div
      className={`specials-card${selected ? " specials-card--selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
    >
      <div
        className="specials-card__media"
        style={firstImage ? undefined : { background: tileGradient(item.name) }}
      >
        {firstImage ? (
          <img src={firstImage} alt="" loading="lazy" />
        ) : hasSound ? (
          <span className="specials-card__glyph">♪</span>
        ) : (
          <span className="specials-card__glyph specials-card__glyph--initial">{item.name.charAt(0).toUpperCase()}</span>
        )}
        <button
          className={`specials-card__check${selected ? " specials-card__check--on" : ""}`}
          aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            toggleSelected(item.objectKey);
          }}
        />
        {item.previewKeys.length > 1 && <span className="specials-card__badge">{item.previewKeys.length}</span>}
        {downloaded && (
          <span className="specials-card__state" title="Downloaded">
            ✓
          </span>
        )}
        {downloading && (
          <div className="specials-card__bar">
            <div className="specials-card__bar-fill" style={{ width: percent !== null ? `${percent}%` : "40%" }} />
          </div>
        )}
      </div>
      <div className="specials-card__body">
        <span className="specials-card__name" title={item.name}>
          {item.name}
        </span>
        <span className="specials-card__meta">{fmtSize(item.size)}</span>
      </div>
    </div>
  );
}
