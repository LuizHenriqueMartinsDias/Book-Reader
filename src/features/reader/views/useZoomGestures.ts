import { useEffect, type RefObject } from 'react';
import { CSS_UNITS } from '../../../lib/pdf';
import { useReader } from '../readerStore';
import type { ZoomChange } from './types';

/** Ctrl/⌘ + wheel (also trackpad pinch, which browsers report that way) and two-finger pinch. */
export function useZoomGestures(ref: RefObject<HTMLElement | null>, onZoom: (next: ZoomChange) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { dist: number; zoom: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoom((z) => z * Math.exp(-e.deltaY * 0.01));
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { dist: dist(e.touches), zoom: useReader.getState().scale / CSS_UNITS };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      onZoom(start.zoom * (dist(e.touches) / start.dist));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, onZoom]);
}
