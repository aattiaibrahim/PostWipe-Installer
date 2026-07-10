import { useEffect, useRef } from "react";

// driftSpeed/driftRadius = autonomous wandering; morphSpeed = self-squish. Tuned up on
// request ("give them autonomy but not crazy fast"): larger orbits + squish, same pace.
const BLOBS = [
  { className: "ambient-bg__blob--1", parallax: 130, driftSpeed: 0.00019, driftRadius: 110, scrollFactor: 0.18, morphSpeed: 0.00045 },
  { className: "ambient-bg__blob--2", parallax: 190, driftSpeed: 0.00026, driftRadius: 150, scrollFactor: -0.24, morphSpeed: 0.00058 },
  { className: "ambient-bg__blob--3", parallax: 90, driftSpeed: 0.00015, driftRadius: 85, scrollFactor: 0.14, morphSpeed: 0.00037 },
];

export function AmbientBackground() {
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const eased = useRef({ x: 0.5, y: 0.5 });
  const scrollTarget = useRef(0);
  const scrollEased = useRef(0);

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      pointer.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    }
    window.addEventListener("mousemove", handleMove);

    const scrollEl = document.querySelector(".app-content");
    function handleScroll() {
      scrollTarget.current = scrollEl ? scrollEl.scrollTop : 0;
    }
    scrollEl?.addEventListener("scroll", handleScroll, { passive: true });

    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      eased.current.x += (pointer.current.x - eased.current.x) * 0.035;
      eased.current.y += (pointer.current.y - eased.current.y) * 0.035;
      scrollEased.current += (scrollTarget.current - scrollEased.current) * 0.06;
      const elapsed = now - start;

      BLOBS.forEach((blob, i) => {
        const el = blobRefs.current[i];
        if (!el) return;
        const parallaxX = (eased.current.x - 0.5) * blob.parallax;
        const parallaxY = (eased.current.y - 0.5) * blob.parallax;
        const driftX = Math.sin(elapsed * blob.driftSpeed + i) * blob.driftRadius;
        const driftY = Math.cos(elapsed * blob.driftSpeed * 1.3 + i) * blob.driftRadius;
        const scrollY = scrollEased.current * blob.scrollFactor;
        // Autonomous sway: each blob slowly squishes on its own axes (out-of-phase X/Y
        // scale oscillation reads as organic breathing, independent of the cursor).
        const scaleX = 1 + 0.14 * Math.sin(elapsed * blob.morphSpeed + i * 2.1);
        const scaleY = 1 + 0.14 * Math.cos(elapsed * blob.morphSpeed * 0.8 + i * 1.4);
        el.style.transform = `translate3d(${parallaxX + driftX}px, ${parallaxY + driftY + scrollY}px, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
      });

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      scrollEl?.removeEventListener("scroll", handleScroll);
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
