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

  return (
    <div className="specials-item">
      {previewUrls.length > 0 && (
        <button
          className="specials-item__preview specials-item__preview--clickable"
          onClick={() => setLightboxOpen(true)}
          title="Click to expand preview"
        >
          <img src={previewUrls[0]} alt="" loading="lazy" />
          {previewUrls.length > 1 && <span className="specials-item__preview-count">{previewUrls.length}</span>}
        </button>
      )}
      {previewUrls.length === 0 && sounds.length > 0 && (
        <button
          className="specials-item__preview specials-item__preview--sound"
          onClick={() => setSoundsOpen(true)}
          title="Preview the sounds"
        >
          <span className="specials-item__sound-glyph">♪</span>
          <span>Preview</span>
        </button>
      )}
      <AnimatePresence>
        {lightboxOpen && previewUrls.length > 0 && (
          <PreviewLightbox
            urls={previewUrls}
            title={item.name}
            // Cursor packs: the second image is the full-set collage — inspecting should
            // show every cursor, not just the thumbnail's Normal Select.
            startIndex={meta.install === "cursor" && previewUrls.length > 1 ? 1 : 0}
            onClose={() => setLightboxOpen(false)}
          />
        )}
        {soundsOpen && sounds.length > 0 && (
          <SoundPreview title={item.name} sounds={sounds} onClose={() => setSoundsOpen(false)} />
        )}
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
      <div className="specials-item__info">
        <span className="specials-item__name">{item.name}</span>
        <span className="specials-item__meta">{fmtSize(item.size)}</span>
        {(error || (failed && job?.error)) && (
          <span className="specials-item__error">{error ?? job?.error}</span>
        )}
        {installMsg && <span className="specials-item__msg">{installMsg}</span>}
        {downloading && (
          <div className="specials-item__bar">
            <div className="specials-item__bar-fill" style={{ width: percent !== null ? `${percent}%` : "40%" }} />
          </div>
        )}
      </div>
      <div className="specials-item__actions">
        {canInstall && (
          <button className="specials-item__install" disabled={!downloaded || installing} onClick={install}>
            {installing ? "Installing…" : "Install"}
          </button>
        )}
        <button className="specials-item__download" disabled={downloading} onClick={download}>
          {downloading ? "Downloading…" : downloaded ? "Re-download" : "Download"}
        </button>
      </div>
    </div>
  );
}
