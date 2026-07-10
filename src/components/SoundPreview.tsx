import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

/** Overlay listing every sound in a set with a play button per sound. One sound plays at a
 *  time; Esc or click-out closes (and stops playback). */
export function SoundPreview({
  title,
  sounds,
  onClose,
}: {
  title: string;
  sounds: { name: string; url: string }[];
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      audioRef.current?.pause();
    };
  }, [onClose]);

  function toggle(sound: { name: string; url: string }) {
    if (playing === sound.name) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(sound.url);
    audioRef.current = audio;
    audio.addEventListener("ended", () => setPlaying((p) => (p === sound.name ? null : p)));
    audio.play().catch(() => setPlaying(null));
    setPlaying(sound.name);
  }

  // Portaled to <body> so ancestor transforms can't trap the fixed overlay (see PreviewLightbox).
  return createPortal(
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
          <span className="sound-preview__count">{sounds.length} sounds</span>
        </div>
        <div className="sound-preview__list">
          {sounds.map((sound) => (
            <button
              key={sound.name}
              className={`sound-preview__row${playing === sound.name ? " sound-preview__row--playing" : ""}`}
              onClick={() => toggle(sound)}
            >
              <span className="sound-preview__play">{playing === sound.name ? "◼" : "▶"}</span>
              <span className="sound-preview__name">{sound.name}</span>
              {playing === sound.name && (
                <span className="sound-preview__bars" aria-hidden="true">
                  <i /><i /><i />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <button className="preview-lightbox__close" onClick={onClose} aria-label="Close sound preview">
        ✕
      </button>
    </motion.div>,
    document.body,
  );
}
