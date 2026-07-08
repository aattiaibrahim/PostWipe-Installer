import { useEffect } from "react";

/**
 * Backdrop-filter blur + animated hue-shifting blobs are expensive to repaint on every
 * frame of a live window resize, which is what made the footer (painted last) visibly lag
 * a moment behind the new window size. Toggles a class that cheapens those effects only
 * while the resize is actually in progress, then restores full quality once it settles.
 */
export function useResizeGlitchGuard() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    function handleResize() {
      document.documentElement.classList.add("is-resizing");
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        document.documentElement.classList.remove("is-resizing");
      }, 200);
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeout);
      document.documentElement.classList.remove("is-resizing");
    };
  }, []);
}
