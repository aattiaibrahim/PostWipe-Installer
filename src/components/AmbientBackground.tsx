import { useEffect, useRef } from "react";

const BLOBS = [
  { className: "ambient-bg__blob--1", parallax: 22, driftSpeed: 0.00011, driftRadius: 40 },
  { className: "ambient-bg__blob--2", parallax: 34, driftSpeed: 0.00016, driftRadius: 55 },
  { className: "ambient-bg__blob--3", parallax: 16, driftSpeed: 0.00009, driftRadius: 30 },
];

export function AmbientBackground() {
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const eased = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      pointer.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    }
    window.addEventListener("mousemove", handleMove);

    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      eased.current.x += (pointer.current.x - eased.current.x) * 0.035;
      eased.current.y += (pointer.current.y - eased.current.y) * 0.035;
      const elapsed = now - start;

      BLOBS.forEach((blob, i) => {
        const el = blobRefs.current[i];
        if (!el) return;
        const parallaxX = (eased.current.x - 0.5) * blob.parallax;
        const parallaxY = (eased.current.y - 0.5) * blob.parallax;
        const driftX = Math.sin(elapsed * blob.driftSpeed + i) * blob.driftRadius;
        const driftY = Math.cos(elapsed * blob.driftSpeed * 1.3 + i) * blob.driftRadius;
        el.style.transform = `translate3d(${parallaxX + driftX}px, ${parallaxY + driftY}px, 0)`;
      });

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient-bg" aria-hidden="true">
      {BLOBS.map((blob, i) => (
        <div
          key={blob.className}
          className={`ambient-bg__blob ${blob.className}`}
          ref={(el) => {
            blobRefs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
