import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { SpecialsItem as Item } from "../state/specialsContentStore";
import type { SpecialsCategoryMeta } from "../lib/specialsConfig";
import { SPECIALS_WORKER_URL } from "../lib/specialsConfig";
import { useSpecialsStore } from "../state/specialsStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import {
  startSpecialsDownload,
  installSpecialsItem,
  listCursorVariants,
  applyCursorVariant,
  type CursorVariant,
} from "../lib/tauriCommands";
import { PreviewLightbox } from "./PreviewLightbox";
import { SoundPreview } from "./SoundPreview";
import { CursorVariantPicker } from "./CursorVariantPicker";

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Deterministic per-name gradient for cards with no preview image — the umbrel-style
 *  colored tile. Dark-leaning so white glyph/initial text reads in both themes. */
export function tileGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  return `linear-gradient(135deg, hsl(${hue} 48% 38%), hsl(${(hue + 46) % 360} 55% 22%))`;
}

/** One vault entry as a gallery card: preview media on top (click to inspect), name/size
 *  below, Download/Install revealed over the media on hover. All download/install flow
 *  matches the old list rows — only the layout is new. */
export function SpecialsItem({ item, meta }: { item: Item; meta: SpecialsCategoryMeta }) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const [destPath, setDestPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [variants, setVariants] = useState<CursorVariant[] | null>(null);

  const job = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === item.objectKey);
  const downloading = !!job && ACTIVE_STATUSES.has(job.status);
  const failed = job?.status === "failed";
  // Only a COMPLETED job counts as downloaded — enabling Install as soon as the download
  // *started* let people unzip a half-written archive and "install.inf not found".
  const downloaded = job?.status === "completed";
  const path = downloaded ? (job?.destPath ?? destPath) : null;
  const canInstall = meta.install !== "none";

  const percent = job?.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;

  function gatedUrl(objectKey: string): string {
    return `${SPECIALS_WORKER_URL}/file/${objectKey.split("/").map(encodeURIComponent).join("/")}?key=${encodeURIComponent(sessionKey ?? "")}`;
  }

  async function download() {
    if (!sessionKey) return;
    setError(null);
    try {
      const { destPath: dp } = await startSpecialsDownload(item.objectKey, item.name, gatedUrl(item.objectKey), item.filename);
      setDestPath(dp);
    } catch (err) {
      setError(String(err));
    }
  }

  async function install() {
    if (!path) return;
    setInstalling(true);
    setInstallMsg(null);
    try {
      // Cursor packs may ship several schemes (dark/light, sizes, colors) as separate
      // install.inf files — enumerate them and let the user pick which one to apply.
      if (meta.install === "cursor" && item.ext === "zip") {
        const found = await listCursorVariants(path);
        if (found.length > 1) {
          setVariants(found);
          return;
        }
      }
      const msg = await installSpecialsItem(path, meta.install);
      setInstallMsg(msg);
    } catch (err) {
      setInstallMsg(String(err));
    } finally {
      setInstalling(false);
    }
  }

  async function pickVariant(variant: CursorVariant) {
    setInstalling(true);
    try {
      const msg = await applyCursorVariant(variant.inf_path);
      setInstallMsg(msg);
      setVariants(null);
    } catch (err) {
      setInstallMsg(String(err));
      setVariants(null);
    } finally {
      setInstalling(false);
    }
  }

  const previewUrls = sessionKey ? item.previewKeys.map(gatedUrl) : [];
  const sounds = sessionKey ? item.audioPreviews.map((a) => ({ name: a.name, url: gatedUrl(a.key) })) : [];
  const hasImage = previewUrls.length > 0;
  const hasSound = sounds.length > 0;

  // Keep the action buttons pinned visible (not hover-only) whenever there's live state
  // the user is mid-flow on: downloading, ready-to-install, or a fresh result message.
  const pinActions = downloading || downloaded || installing || !!installMsg || !!error || failed;

  function inspect() {
    if (hasImage) setLightboxOpen(true);
    else if (hasSound) setSoundsOpen(true);
  }

  return (
    <div className={`specials-card${pinActions ? " specials-card--active" : ""}`}>
      <div
        className={`specials-card__media${hasImage || hasSound ? " specials-card__media--inspectable" : ""}`}
        style={hasImage ? undefined : { background: tileGradient(item.name) }}
        onClick={inspect}
        role={hasImage || hasSound ? "button" : undefined}
        title={hasImage ? "Click to expand preview" : hasSound ? "Preview the sounds" : undefined}
      >
        {hasImage ? (
          <img src={previewUrls[0]} alt="" loading="lazy" />
        ) : hasSound ? (
          <span className="specials-card__glyph">♪</span>
        ) : (
          <span className="specials-card__glyph specials-card__glyph--initial">{item.name.charAt(0).toUpperCase()}</span>
        )}
        {previewUrls.length > 1 && <span className="specials-card__badge">{previewUrls.length}</span>}
        <div className="specials-card__actions" onClick={(e) => e.stopPropagation()}>
          {canInstall && (
            <button className="specials-card__btn specials-card__btn--install" disabled={!downloaded || installing} onClick={install}>
              {installing ? "Installing…" : "Install"}
            </button>
          )}
          <button className="specials-card__btn" disabled={downloading} onClick={download}>
            {downloading ? "Downloading…" : downloaded ? "Re-download" : "Download"}
          </button>
        </div>
        {downloading && (
          <div className="specials-card__bar">
            <div className="specials-card__bar-fill" style={{ width: percent !== null ? `${percent}%` : "40%" }} />
          </div>
        )}
      </div>
      <AnimatePresence>
        {lightboxOpen && hasImage && (
          <PreviewLightbox
            urls={previewUrls}
            title={item.name}
            // Cursor packs: the second image is the full-set collage — inspecting should
            // show every cursor, not just the thumbnail's Normal Select.
            startIndex={meta.install === "cursor" && previewUrls.length > 1 ? 1 : 0}
            onClose={() => setLightboxOpen(false)}
          />
        )}
        {soundsOpen && hasSound && <SoundPreview title={item.name} sounds={sounds} onClose={() => setSoundsOpen(false)} />}
        {variants && (
          <CursorVariantPicker
            title={item.name}
            variants={variants}
            busy={installing}
            onPick={pickVariant}
            onClose={() => {
              setVariants(null);
              setInstalling(false);
            }}
          />
        )}
      </AnimatePresence>
      <div className="specials-card__body">
        <span className="specials-card__name" title={item.name}>
          {item.name}
        </span>
        <span className="specials-card__meta">{fmtSize(item.size)}</span>
        {(error || (failed && job?.error)) && <span className="specials-card__error">{error ?? job?.error}</span>}
        {installMsg && <span className="specials-card__msg">{installMsg}</span>}
      </div>
    </div>
  );
}
