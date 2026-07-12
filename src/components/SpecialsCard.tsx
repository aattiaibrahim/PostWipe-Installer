import type { SpecialsItem as Item } from "../state/specialsContentStore";
import { SPECIALS_WORKER_URL } from "../lib/specialsConfig";
import { useSpecialsStore } from "../state/specialsStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";

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

export function gatedUrl(objectKey: string, sessionKey: string | null): string {
  return `${SPECIALS_WORKER_URL}/file/${objectKey.split("/").map(encodeURIComponent).join("/")}?key=${encodeURIComponent(sessionKey ?? "")}`;
}

/** A single vault item as a gallery tile: preview art (or a gradient glyph tile) with the
 *  name/size beneath. Clicking opens the detail sheet — actions live there, not on the card. */
export function SpecialsCard({ item, onOpen }: { item: Item; onOpen: (item: Item) => void }) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const jobs = useDownloadQueueStore((s) => s.jobs);

  const job = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === item.objectKey);
  const downloading = !!job && ACTIVE_STATUSES.has(job.status);
  const downloaded = job?.status === "completed";
  const percent = job?.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;

  const hasImage = item.previewKeys.length > 0;
  const hasSound = item.audioPreviews.length > 0;
  const firstImage = hasImage ? gatedUrl(item.previewKeys[0], sessionKey) : null;

  return (
    <button className="specials-card" onClick={() => onOpen(item)}>
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
    </button>
  );
}
