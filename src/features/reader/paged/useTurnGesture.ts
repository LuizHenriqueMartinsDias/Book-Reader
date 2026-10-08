import { useRef } from 'react';
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
 * Recognizes page-turn gestures on the book element:
 * - mouse/pen: press in an outer edge band (shown as hot zones) and drag, or click there;
 * - finger: swipe horizontally anywhere, or tap near an outer edge.
 * Fingers only turn pages with the select tool, or with any tool once a stylus is in use
 * (the stylus draws and the finger navigates).
 */
export function useTurnGesture(handlers: TurnHandlers, enabled: boolean) {
  const g = useRef<{
    id: number;
    start: ClientPoint;
    last: ClientPoint & { t: number };
    vx: number;
    dir: TurnDir | null;
    zone: TurnDir | null;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);
  const h = useRef(handlers);
  h.current = handlers;

  const zoneAt = (x: number, rect: DOMRect, band: number): TurnDir | null => {
    const f = (x - rect.left) / rect.width;
    return f >= 1 - band ? 'next' : f <= band ? 'prev' : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!enabled || g.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { tool, penDetected } = useUi.getState();
    const finger = e.pointerType === 'touch';
    if (finger ? tool !== 'select' && !penDetected : tool !== 'select') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = zoneAt(e.clientX, rect, finger ? TAP_BAND : EDGE_BAND);
    // Mouse and pen only grab the page at the edges; elsewhere they select text.
    if (!finger && !zone) return;
    const start = { x: e.clientX, y: e.clientY };
    g.current = { id: e.pointerId, start, last: { ...start, t: e.timeStamp }, vx: 0, dir: null, zone, dragging: false, rect };
    if (!finger) {
      e.preventDefault(); // no text selection while dragging the corner
      e.currentTarget.setPointerCapture(e.pointerId);
      if (h.current.begin(zone!, start)) Object.assign(g.current, { dir: zone, dragging: true });
      else g.current = null; // nothing to turn to
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const p = { x: e.clientX, y: e.clientY };
    const dt = e.timeStamp - s.last.t;
    if (dt > 0) s.vx = 0.7 * ((p.x - s.last.x) / dt) + 0.3 * s.vx;
    s.last = { ...p, t: e.timeStamp };
    if (!s.dragging) {
      const dx = p.x - s.start.x;
      const dy = p.y - s.start.y;
      if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const dir: TurnDir = dx < 0 ? 'next' : 'prev';
      if (getSelection()?.isCollapsed === false) return; // the finger is extending a text selection
      e.currentTarget.setPointerCapture(e.pointerId);
      if (!h.current.begin(dir, s.start)) {
        g.current = null;
        return;
      }
      Object.assign(s, { dir, dragging: true });
    }
    h.current.move(p);
  };

  const finish = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    const p = { x: e.clientX, y: e.clientY };
    const moved = Math.hypot(p.x - s.start.x, p.y - s.start.y) > SLOP;
    if (s.dragging && moved && !cancelled) h.current.end(p, s.vx);
    // A click on the edge turns the page, picking up from the corner it may have lifted.
    else if (!moved && !cancelled && s.zone) h.current.tap(s.zone);
    else if (s.dragging) h.current.end(s.start, 0); // let the corner fall back
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => finish(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => finish(e, true),
  };
}
