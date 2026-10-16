/** The pen's side button (2, which Samsung reports as 1 while hovering) or eraser end (32). */
const BUTTONS = 1 | 2 | 32;
/**
 * A press longer than this isn't a click (it was held to touch the screen, which the page
 * never sees). Generous: a pen held still reports nothing, so the release can arrive late.
 */
const CLICK_MS = 1500;

export interface PenSample {
  type: string;
  pointerType: string;
  buttons: number;
  pressure: number;
  time: number;
}

/**
 * Notices a click of the pen's button while it hovers. On Samsung tablets, touching the screen
 * with the button held never reaches the page (Chrome takes it to select text), so a click in
 * the air is the button's only use there. Feed it the pen's pointer events; it says when a
 * click ended.
 */
export function penButtonClicks() {
  let touching = false;
  let heldSince: number | null = null;
  return (e: PenSample): boolean => {
    if (e.pointerType !== 'pen') return false;
    if (e.type === 'pointerdown') {
      touching = true;
      heldSince = null;
      return false;
    }
    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      touching = false;
      return false;
    }
    if (touching || e.pressure > 0) return false;
    if ((e.buttons & BUTTONS) !== 0) {
      heldSince ??= e.time;
      return false;
    }
    if (heldSince === null) return false;
    const click = e.time - heldSince < CLICK_MS;
    heldSince = null;
    return click;
  };
}
