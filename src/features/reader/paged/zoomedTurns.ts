import type { TurnDir } from './useTurnGesture';

/** A one-finger touch on a zoomed-in page: how it moved and where the page was scrolled. */
export interface ZoomedTouch {
  dx: number;
  dy: number;
  ms: number;
  /** Where the touch started, as a fraction of the screen width. */
  startFraction: number;
  /**
   * How the finger moved since the page got scrolled all the way to a side (since the touch
   * started, if it was there already), and to which side; null if it never got there.
   */
  edge: { dx: number; dy: number; atLeft: boolean; atRight: boolean } | null;
}

const TAP_SLOP = 10;
const TAP_MS = 350;
const TAP_BAND = 0.15;
const SWIPE_MIN = 60;

/**
 * Zoomed in, a finger pans the page; it turns the page only when it's clearly meant to:
 * a quick tap near the left/right edge of the screen, or a horizontal swipe that goes on past
 * the page's edge (it pans to the edge and, the finger still going, turns, in one swipe).
 */
export function zoomedTurn(t: ZoomedTouch): TurnDir | null {
  const dist = Math.hypot(t.dx, t.dy);
  if (dist < TAP_SLOP && t.ms < TAP_MS) {
    if (t.startFraction <= TAP_BAND) return 'prev';
    if (t.startFraction >= 1 - TAP_BAND) return 'next';
    return null;
  }
  const e = t.edge;
  if (!e || Math.abs(e.dx) < SWIPE_MIN || Math.abs(e.dx) < Math.abs(e.dy) * 1.5) return null;
  if (e.dx < 0 && e.atRight) return 'next';
  if (e.dx > 0 && e.atLeft) return 'prev';
  return null;
}
