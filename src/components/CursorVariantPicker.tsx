import { useEffect } from "react";
import { motion } from "framer-motion";
import type { CursorVariant } from "../lib/tauriCommands";

/** "Which cursor scheme do you want?" — shown when a downloaded pack contains more than one
 *  install.inf. Picking one applies that .inf directly. */
export function CursorVariantPicker({
  title,
  variants,
  busy,
  onPick,
  onClose,
}: {
  title: string;
  variants: CursorVariant[];
  busy: boolean;
  onPick: (variant: CursorVariant) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="preview-lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
    >
      <div className="sound-preview" onClick={(e) => e.stopPropagation()}>
        <div className="sound-preview__header">
          <span className="sound-preview__title">{title}</span>
          <span className="sound-preview__count">pick a scheme to install</span>
        </div>
        <div className="sound-preview__list">
          {variants.map((variant) => (
            <button
              key={variant.inf_path}
              className="sound-preview__row"
              disabled={busy}
              onClick={() => onPick(variant)}
            >
              <span className="sound-preview__play">↪</span>
              <span className="sound-preview__name">{variant.label}</span>
            </button>
          ))}
        </div>
      </div>
      <button className="preview-lightbox__close" onClick={onClose} aria-label="Close picker">
        ✕
      </button>
    </motion.div>
  );
}
