import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { SpecialsItem as Item } from "../state/specialsContentStore";
import type { SpecialsCategoryMeta } from "../lib/specialsConfig";
import { useSpecialsStore } from "../state/specialsStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import {
  startSpecialsDownload,
  installSpecialsItem,
  listCursorVariants,
  applyCursorVariant,
  type CursorVariant,
} from "../lib/tauriCommands";
import { CursorVariantPicker } from "./CursorVariantPicker";
import { fmtSize, tileGradient } from "./SpecialsCard";
import { resolvePreviews, ownImageUrl, gatedUrl } from "../lib/specialsPreview";

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

/** The umbrel-style detail sheet opened by clicking a card: big preview on the left, name /
 *  size / description and the Download-Install actions on the right. Owns the whole download
 *  and install flow (previously on the list row). */
export function SpecialsDetail({ item, meta, onClose }: { item: Item; meta: SpecialsCategoryMeta; onClose: () => void }) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const [destPath, setDestPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [variants, setVariants] = useState<CursorVariant[] | null>(null);
  const [index, setIndex] = useState(0);

  const job = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === item.objectKey);
  const downloading = !!job && ACTIVE_STATUSES.has(job.status);
  const failed = job?.status === "failed";
  const downloaded = job?.status === "completed";
  const path = downloaded ? (job?.destPath ?? destPath) : null;
  const canInstall = meta.install !== "none";
  const percent = job?.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;

  // Grid tiles use the small uploaded thumbnail (resolvePreviews → previewKeys); the detail
  // shows the full-res / animated ORIGINAL for image items, thumbnails/carousel otherwise.
  const own = ownImageUrl(item, sessionKey);
  const previewUrls = own ? [own] : resolvePreviews(item, sessionKey);
  const sounds = sessionKey ? item.audioPreviews.map((a) => ({ name: a.name, url: gatedUrl(a.key, sessionKey) })) : [];
  const many = previewUrls.length > 1;
  // Cursor packs: the 2nd image is the full-set collage — open on it so inspecting shows every cursor.
  const initialIndex = meta.install === "cursor" && previewUrls.length > 1 ? 1 : 0;

  useEffect(() => setIndex(initialIndex), [initialIndex]);

  const step = useCallback((dir: number) => setIndex((i) => (i + dir + previewUrls.length) % previewUrls.length), [previewUrls.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) step(1);
      else if (e.key === "ArrowLeft" && many) step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step, many]);

  async function download() {
    if (!sessionKey) return;
    setError(null);
    try {
      const { destPath: dp } = await startSpecialsDownload(item.objectKey, item.name, gatedUrl(item.objectKey, sessionKey), item.filename);
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
      if (meta.install === "cursor" && item.ext === "zip") {
        const found = await listCursorVariants(path);
        if (found.length > 1) {
          setVariants(found);
          return;
        }
      }
      setInstallMsg(await installSpecialsItem(path, meta.install));
    } catch (err) {
      setInstallMsg(String(err));
    } finally {
      setInstalling(false);
    }
  }

  async function pickVariant(variant: CursorVariant) {
    setInstalling(true);
    try {
      setInstallMsg(await applyCursorVariant(variant.inf_path));
      setVariants(null);
    } catch (err) {
      setInstallMsg(String(err));
      setVariants(null);
    } finally {
      setInstalling(false);
    }
  }

  const hasImage = previewUrls.length > 0;

  return createPortal(
    <motion.div
      className="specials-detail"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
    >
      <motion.div
        className="specials-detail__sheet"
        initial={{ scale: 0.94, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 440, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="specials-detail__stage"
          style={hasImage ? undefined : { background: tileGradient(item.name) }}
        >
          {hasImage ? (
            <>
              <AnimatePresence mode="wait">
                <motion.img
                  key={index}
                  className="specials-detail__img"
                  src={previewUrls[index]}
                  alt={item.name}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                />
              </AnimatePresence>
              {many && (
                <>
                  <button className="specials-detail__arrow specials-detail__arrow--l" onClick={() => step(-1)} aria-label="Previous preview">
                    ‹
                  </button>
                  <button className="specials-detail__arrow specials-detail__arrow--r" onClick={() => step(1)} aria-label="Next preview">
                    ›
                  </button>
                  <span className="specials-detail__counter">
                    {index + 1} / {previewUrls.length}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="specials-detail__glyph">{sounds.length > 0 ? "♪" : item.name.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="specials-detail__info">
          <span className="specials-detail__cat">{meta.label}</span>
          <h2 className="specials-detail__name">{item.name}</h2>
          <span className="specials-detail__meta">
            {fmtSize(item.size)}
            {item.ext ? ` · ${item.ext.toUpperCase()}` : ""}
          </span>

          {sounds.length > 0 && (
            <div className="specials-detail__sounds">
              {sounds.map((s) => (
                <div key={s.url} className="specials-detail__sound">
                  <span className="specials-detail__sound-name">{s.name}</span>
                  <audio controls preload="none" src={s.url} />
                </div>
              ))}
            </div>
          )}

          {(error || (failed && job?.error)) && <p className="specials-detail__error">{error ?? job?.error}</p>}
          {installMsg && <p className="specials-detail__msg">{installMsg}</p>}
          {downloading && (
            <div className="specials-detail__bar">
              <div className="specials-detail__bar-fill" style={{ width: percent !== null ? `${percent}%` : "40%" }} />
            </div>
          )}

          <div className="specials-detail__actions">
            <button className="specials-detail__btn" disabled={downloading} onClick={download}>
              {downloading ? "Downloading…" : downloaded ? "Re-download" : "Download"}
            </button>
            {canInstall && (
              <button className="specials-detail__btn specials-detail__btn--primary" disabled={!downloaded || installing} onClick={install}>
                {installing ? "Installing…" : "Install"}
              </button>
            )}
          </div>
          {canInstall && !downloaded && <span className="specials-detail__hint">Download first, then Install.</span>}
        </div>

        <button className="specials-detail__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </motion.div>

      <AnimatePresence>
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
    </motion.div>,
    document.body,
  );
}
