import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/** Full-screen preview viewer: click-out or Esc closes, arrows/keys page through images. */
export function PreviewLightbox({
  urls,
  title,
  startIndex = 0,
  onClose,
}: {
  urls: string[];
  title: string;
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const many = urls.length > 1;

  const step = useCallback(
    (dir: number) => setIndex((i) => (i + dir + urls.length) % urls.length),
    [urls.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) step(1);
      else if (e.key === "ArrowLeft" && many) step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step, many]);

  // Portaled to <body>: ancestors of the Specials rows carry framer-motion transforms,
  // which hijack position:fixed and would trap the lightbox inside the category panel.
  return createPortal(
    <motion.div
      className="preview-lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
    >
      <div className="preview-lightbox__stage" onClick={(e) => e.stopPropagation()}>
        {many && (
          <button className="preview-lightbox__arrow" onClick={() => step(-1)} aria-label="Previous preview">
            ‹
          </button>
        )}
        <AnimatePresence mode="wait">
          <motion.img
            key={index}
            className="preview-lightbox__img"
            src={urls[index]}
            alt={title}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.14 }}
          />
        </AnimatePresence>
        {many && (
          <button className="preview-lightbox__arrow" onClick={() => step(1)} aria-label="Next preview">
            ›
          </button>
        )}
      </div>
      <div className="preview-lightbox__caption" onClick={(e) => e.stopPropagation()}>
        <span>{title}</span>
        {many && (
          <span className="preview-lightbox__counter">
            {index + 1} / {urls.length}
          </span>
        )}
      </div>
      <button className="preview-lightbox__close" onClick={onClose} aria-label="Close preview">
        ✕
      </button>
    </motion.div>,
    document.body,
  );
}
