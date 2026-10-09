/**
 * Deciding what a two-finger gesture means. Real fingers both spread and turn a little at once,
 * so the gesture starts as whichever clearly dominates, and a big enough amount of the other
 * adds it on top (zooming that keeps twisting also rotates, and vice versa).
 */
export type TwoFingerMode = 'pending' | 'zoom' | 'rotate' | 'both';

/** Spread (as a ratio) and turn (degrees) that each count as clearly intended at the start… */
const ZOOM_START = 1.12;
const TURN_START = 10;
/** …and that add the other effect once the gesture has started. */
const ZOOM_ADD = 1.35;
const TURN_ADD = 25;

export interface TwoFingerState {
  mode: TwoFingerMode;
  /** Turn already made when rotation joined a zoom, so the page doesn't jump by that much. */
  turnOffset: number;
}

export const initialTwoFinger = (): TwoFingerState => ({ mode: 'pending', turnOffset: 0 });

/** Updates the mode from the current spread `ratio` and `turn` (degrees since the fingers landed). */
export function classify(s: TwoFingerState, ratio: number, turn: number, canRotate = true): TwoFingerState {
  const zoomScore = Math.abs(Math.log(ratio)) / Math.log(ZOOM_START);
  const turnScore = canRotate ? Math.abs(turn) / TURN_START : 0;
  switch (s.mode) {
    case 'pending':
      if (zoomScore < 1 && turnScore < 1) return s;
      return turnScore >= zoomScore ? { mode: 'rotate', turnOffset: 0 } : { mode: 'zoom', turnOffset: 0 };
    case 'zoom':
      return canRotate && Math.abs(turn) >= TURN_ADD ? { mode: 'both', turnOffset: turn } : s;
    case 'rotate':
      return Math.abs(Math.log(ratio)) >= Math.log(ZOOM_ADD) ? { ...s, mode: 'both' } : s;
    default:
      return s;
  }
}

export const zooms = (s: TwoFingerState) => s.mode === 'zoom' || s.mode === 'both';
export const rotates = (s: TwoFingerState) => s.mode === 'rotate' || s.mode === 'both';
/** Rotation to apply: the fingers' turn minus what happened before rotation joined in. */
export const appliedTurn = (s: TwoFingerState, turn: number) => turn - s.turnOffset;
