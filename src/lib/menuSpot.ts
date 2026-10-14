/**
 * Room for Android's own bar on a selection (copy, share, search…): Chrome puts it above the
 * selection when it fits there, else below.
 */
export const NATIVE_BAR = 64;
/** Room at the bottom for Chrome's Google panel on a selection (pulled up for the search and its AI answer). */
export const SEARCH_PANEL = 96;
const GAP = 8;

/**
 * Top of a menu of `height` for a selection spanning `top`…`bottom` (on screen), clear of the
 * browser's own selection bar and search panel: below the selection, else above it, else (a
 * selection filling the screen) as low as it fits over the text.
 */
export function menuTop(top: number, bottom: number, height: number, viewport: number): number {
  const nativeAbove = top >= NATIVE_BAR;
  const below = bottom + GAP + (nativeAbove ? 0 : NATIVE_BAR);
  if (below + height <= viewport - SEARCH_PANEL) return below;
  const above = top - GAP - height - (nativeAbove ? NATIVE_BAR : 0);
  if (above >= GAP) return above;
  return Math.max(GAP, viewport - SEARCH_PANEL - height);
}
