import { useEffect, useRef } from 'react';
import { useUi } from '../../../store/ui';

export type TurnDir = 'next' | 'prev';
export type ClientPoint = { x: number; y: number };

export interface TurnHandlers {
  /** A drag that will turn (or try to turn) the page has started at `start`. */
  begin: (dir: TurnDir, start: ClientPoint) => boolean;
  move: (p: ClientPoint) => void;
  /** `vx` is the horizontal release velocity in px/ms. */
  end: (p: ClientPoint, vx: number) => void;
  tap: (dir: TurnDir) => void;
}

/** Fraction of the book's width near each outer edge that grabs the page with a mouse or pen. */
export const EDGE_BAND = 0.12;
/** Taps with a finger in this outer fraction turn the page (like an e-reader). */
const TAP_BAND = 0.22;
const SLOP = 8;

/**
 * Recognizes page-turn gestures over the whole reading area (the `[data-turn-surface]` around
 * the book), so the margins beside a two-page spread work too:
 * - mouse/pen: press in an outer edge band of the book (shown as hot zones) and drag, or click there;
 * - finger: swipe horizontally anywhere, or tap near the left/right edge of the screen.
 * Fingers only turn pages with the select tool, or with any tool once a stylus is in use
 * (the stylus draws and the finger navigates).
 */
export function useTurnGesture(handlers: TurnHandlers, enabled: boolean, bookRef: React.RefObject<HTMLElement | null>) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const book = bookRef.current;
    if (!book || !enabled) return;
    const surface = book.closest<HTMLElement>('[data-turn-surface]') ?? book;
    let g: {
      id: number;
      start: ClientPoint;
      last: ClientPoint & { t: number };
      vx: number;
      zone: TurnDir | null;
      dragging: boolean;
    } | null = null;

    const zoneIn = (x: number, rect: DOMRect, band: number): TurnDir | null => {
      const f = (x - rect.left) / rect.width;
      return f >= 1 - band ? 'next' : f <= band ? 'prev' : null;
    };

    const onDown = (e: PointerEvent) => {
      if (g || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const { tool, penDetected } = useUi.getState();
      const finger = e.pointerType === 'touch';
      if (finger ? tool !== 'select' && !penDetected : tool !== 'select') return;
      let zone: TurnDir | null;
      if (finger) zone = zoneIn(e.clientX, surface.getBoundingClientRect(), TAP_BAND);
      else {
        // Mouse and pen only grab the page by the book's edges; elsewhere they select text.
        const r = book.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        zone = inside ? zoneIn(e.clientX, r, EDGE_BAND) : null;
        if (!zone) return;
      }
      const start = { x: e.clientX, y: e.clientY };
      g = { id: e.pointerId, start, last: { ...start, t: e.timeStamp }, vx: 0, zone, dragging: false };
      if (!finger) {
        e.preventDefault(); // no text selection while dragging the corner
        surface.setPointerCapture(e.pointerId);
        if (h.current.begin(zone!, start)) g.dragging = true;
        else g = null; // nothing to turn to
      }
    };

    const onMove = (e: PointerEvent) => {
      const s = g;
      if (!s || s.id !== e.pointerId) return;
      const p = { x: e.clientX, y: e.clientY };
      const dt = e.timeStamp - s.last.t;
      if (dt > 0) s.vx = 0.7 * ((p.x - s.last.x) / dt) + 0.3 * s.vx;
      s.last = { ...p, t: e.timeStamp };
      if (!s.dragging) {
        const dx = p.x - s.start.x;
        const dy = p.y - s.start.y;
        if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        if (getSelection()?.isCollapsed === false) return; // the finger is extending a text selection
        surface.setPointerCapture(e.pointerId);
        if (!h.current.begin(dx < 0 ? 'next' : 'prev', s.start)) {
          g = null;
          return;
        }
        s.dragging = true;
      }
      h.current.move(p);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const s = g;
      if (!s || s.id !== e.pointerId) return;
      g = null;
      const p = { x: e.clientX, y: e.clientY };
      const moved = Math.hypot(p.x - s.start.x, p.y - s.start.y) > SLOP;
      if (s.dragging && moved && !cancelled) h.current.end(p, s.vx);
      // A click on the edge turns the page, picking up from the corner it may have lifted.
      else if (!moved && !cancelled && s.zone) h.current.tap(s.zone);
      else if (s.dragging) h.current.end(s.start, 0); // let the corner fall back
    };
    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onCancel);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onCancel);
    };
  }, [enabled, bookRef]);
}
