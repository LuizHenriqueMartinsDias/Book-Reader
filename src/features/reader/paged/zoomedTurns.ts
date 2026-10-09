import type { TurnDir } from './useTurnGesture';

/** A one-finger touch on a zoomed-in page: how it moved and where the page was scrolled. */
export interface ZoomedTouch {
  dx: number;
  dy: number;
  ms: number;
  /** Where the touch started, as a fraction of the screen width. */
  startFraction: number;
  /** The page was already scrolled all the way to that side when the touch started. */
  atLeft: boolean;
  atRight: boolean;
}

const TAP_SLOP = 10;
const TAP_MS = 350;
const TAP_BAND = 0.15;
const SWIPE_MIN = 60;

/**
 * Zoomed in, a finger pans the page; it turns the page only when it's clearly meant to:
 * a quick tap near the left/right edge of the screen, or a horizontal swipe that starts with
 * the page already scrolled to that edge (so you reach the edge first, then swipe once more).
 */
export function zoomedTurn(t: ZoomedTouch): TurnDir | null {
  const dist = Math.hypot(t.dx, t.dy);
  if (dist < TAP_SLOP && t.ms < TAP_MS) {
    if (t.startFraction <= TAP_BAND) return 'prev';
    if (t.startFraction >= 1 - TAP_BAND) return 'next';
    return null;
  }
  if (Math.abs(t.dx) < SWIPE_MIN || Math.abs(t.dx) < Math.abs(t.dy) * 1.5) return null;
  if (t.dx < 0 && t.atRight) return 'next';
  if (t.dx > 0 && t.atLeft) return 'prev';
  return null;
}
