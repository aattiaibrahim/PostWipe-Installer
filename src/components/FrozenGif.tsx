import { useEffect, useRef } from "react";

/** Draws only the FIRST frame of a GIF into a canvas, so a grid full of animated GIFs
 *  (Profile Pics) doesn't peg the CPU with every one animating at once. Display-only —
 *  we never read the canvas back, so a cross-origin (Worker) source drawing fine despite
 *  tainting. The detail sheet still uses a real <img>, so opening one animates it. */
export function FrozenGif({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [src]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
