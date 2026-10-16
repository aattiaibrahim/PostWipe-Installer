import { useEffect, useRef } from "react";

/**
 * Calls `onOutside` when a pointer-down lands outside the returned ref's element.
 * Listens only while `active` so closed dropdowns don't keep a document listener alive.
 */
export function useClickOutside<T extends HTMLElement>(active: boolean, onOutside: () => void) {
  const ref = useRef<T | null>(null);
  const callback = useRef(onOutside);
  callback.current = onOutside;

  useEffect(() => {
    if (!active) return;

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback.current();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active]);

  return ref;
}
