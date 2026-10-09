import type { Margins, NotePage, Paper } from '../../db/schema';
import { PAPER_SPACING } from './render';

/**
 * "Stretching" a sheet: moving its edges out (or in) to make room to write. On an imported PDF
 * page that's blank space around the PDF, kept as `margins` so the PDF sits inset by them; on a
 * plain page the page just gets bigger. Items keep page coordinates, so when the left or top edge
 * moves they move too, staying where they were on the PDF or among the lines.
 */

export const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };
/** Smallest a plain page can shrink to, in points. */
export const MIN_PAGE = 150;

export const marginsOf = (page: NotePage): Margins => page.background?.margins ?? NO_MARGINS;

export const hasMargins = (m: Margins) => m.top > 0 || m.right > 0 || m.bottom > 0 || m.left > 0;

/** Where the PDF page sits within the note page, in points. */
export function pdfBox(page: NotePage) {
  const m = marginsOf(page);
  return { x: m.left, y: m.top, w: page.width - m.left - m.right, h: page.height - m.top - m.bottom };
}

/**
 * What stretching is measured from: the PDF on PDF pages (sides are its margins, never below 0),
 * else the page as it is now (sides are how far each edge moves, negative to shrink).
 */
export const stretchBase = (page: NotePage) => (page.background ? pdfBox(page) : { x: 0, y: 0, w: page.width, h: page.height });
export const currentSides = (page: NotePage): Margins => (page.background ? marginsOf(page) : NO_MARGINS);

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

/** Any page stretched by `sides` (see `stretchBase`), and how far its items move. */
export function stretchPage(page: NotePage, sides: Margins) {
  if (page.background) return withMargins(page, sides)!;
  const width = Math.max(MIN_PAGE, page.width + sides.left + sides.right);
  const height = Math.max(MIN_PAGE, page.height + sides.top + sides.bottom);
  return { page: { ...page, width, height }, dx: sides.left, dy: sides.top };
}

/**
 * The left and top edges move in whole steps of the paper's pattern, so writing that moves with
 * them stays on its lines (lined paper only needs it vertically).
 */
export function snapToPaper(sides: Margins, paper: Paper): Margins {
  if (paper.style === 'blank') return sides;
  const s = PAPER_SPACING[paper.style];
  const snap = (v: number) => Math.round(v / s) * s;
  return { ...sides, top: snap(sides.top), left: paper.style === 'lined' ? sides.left : snap(sides.left) };
}
