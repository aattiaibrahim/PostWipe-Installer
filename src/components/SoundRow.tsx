import { useEffect, useRef, useState } from "react";

/** A modern one-tap sound preview row: circular play/pause button, name, and an animated
 *  equalizer while it plays — replaces the native <audio controls> "ancient" look. */
export function SoundRow({ name, url }: { name: string; url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => audioRef.current?.pause(), []);

  function toggle() {
    if (!audioRef.current) {
      const a = new Audio(url);
      a.addEventListener("ended", () => setPlaying(false));
      audioRef.current = a;
    }
    const a = audioRef.current;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  return (
    <button className={`sound-row${playing ? " sound-row--playing" : ""}`} onClick={toggle}>
      <span className="sound-row__btn">
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
          </svg>
        )}
      </span>
      <span className="sound-row__name">{name}</span>
      <span className="sound-row__eq" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
