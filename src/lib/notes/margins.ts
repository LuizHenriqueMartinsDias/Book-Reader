import type { Margins, NotePage } from '../../db/schema';

/**
 * "Stretching" a sheet: blank space around an imported PDF page to write in. The page grows by
 * the margins and the PDF sits inset by them; items keep page coordinates, so when the left or
 * top margin changes they move along with the PDF.
 */

export const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

export const marginsOf = (page: NotePage): Margins => page.background?.margins ?? NO_MARGINS;

export const hasMargins = (m: Margins) => m.top > 0 || m.right > 0 || m.bottom > 0 || m.left > 0;

/** Where the PDF page sits within the note page, in points. */
export function pdfBox(page: NotePage) {
  const m = marginsOf(page);
  return { x: m.left, y: m.top, w: page.width - m.left - m.right, h: page.height - m.top - m.bottom };
}

/** The page with new margins, and how far its items move to stay on the same spot of the PDF. */
export function withMargins(page: NotePage, margins: Margins) {
  if (!page.background) return null;
  const old = marginsOf(page);
  const { w, h } = pdfBox(page);
  const m = { top: Math.max(0, margins.top), right: Math.max(0, margins.right), bottom: Math.max(0, margins.bottom), left: Math.max(0, margins.left) };
  const { margins: _, ...background } = page.background;
  const next: NotePage = {
    ...page,
    width: w + m.left + m.right,
    height: h + m.top + m.bottom,
    background: hasMargins(m) ? { ...background, margins: m } : background,
  };
  return { page: next, dx: m.left - old.left, dy: m.top - old.top };
}
