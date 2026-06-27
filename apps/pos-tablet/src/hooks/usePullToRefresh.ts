import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** px to drag before triggering. Default: 64 */
  threshold?: number;
  /** Whether pull-to-refresh is active. Default: true */
  enabled?: boolean;
}

/**
 * usePullToRefresh — attaches to a scrollable container ref.
 *
 * Returns `{ containerRef, pulling, progress }`:
 *  - `containerRef` — attach to the scrollable div
 *  - `pulling`      — true while the user is pulling (show indicator)
 *  - `progress`     — 0–1 ratio of threshold reached (for indicator fill)
 *
 * Calls `onRefresh()` when the threshold is crossed and pointer released.
 */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  { threshold = 64, enabled = true }: Options = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);

  const startYRef    = useRef<number | null>(null);
  const pullDeltaRef = useRef<number>(0);

  const [pulling,  setPulling]  = useState(false);
  const [progress, setProgress] = useState(0);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startYRef.current    = e.clientY;
    pullDeltaRef.current = 0;
  }, [enabled]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    if (delta <= 0) { startYRef.current = null; return; }
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) { startYRef.current = null; return; }
    /* Rubber-band: slow down past threshold */
    const clamped = Math.min(delta, threshold * 1.8);
    pullDeltaRef.current = clamped;
    setProgress(Math.min(1, clamped / threshold));
    setPulling(clamped > 8);
    if (clamped > 8) e.preventDefault();
  }, [threshold]);

  const onPointerUp = useCallback(() => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    if (pullDeltaRef.current >= threshold) {
      void onRefresh();
    }
    setPulling(false);
    setProgress(0);
    pullDeltaRef.current = 0;
  }, [threshold, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    el.addEventListener("pointerdown",  onPointerDown, { passive: true });
    el.addEventListener("pointermove",  onPointerMove, { passive: false });
    el.addEventListener("pointerup",    onPointerUp,   { passive: true });
    el.addEventListener("pointercancel",onPointerUp,   { passive: true });

    return () => {
      el.removeEventListener("pointerdown",  onPointerDown);
      el.removeEventListener("pointermove",  onPointerMove);
      el.removeEventListener("pointerup",    onPointerUp);
      el.removeEventListener("pointercancel",onPointerUp);
    };
  }, [enabled, onPointerDown, onPointerMove, onPointerUp]);

  return { containerRef, pulling, progress };
}
