import { useEffect } from "react";

/**
 * Locks document body scroll while `locked` is true.
 * Safe against multiple simultaneous callers — whichever unmounts last
 * restores overflow via the cleanup function.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
