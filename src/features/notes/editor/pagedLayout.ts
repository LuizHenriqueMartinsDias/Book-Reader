/** Geometry of the paged notebook's scroll content: where each page sits at a given scale. */

export const GAP = 12;
export const FOOTER = 34;
export const PADDING = 16;

/** Size of the box a page takes on screen when turned by `deg` (its bounding box), in points. */
export function turnedSize(p: { width: number; height: number }, deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  // Rounded so quarter turns give the exact swapped size.
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { width: r(p.width * c + p.height * s), height: r(p.width * s + p.height * c) };
}

export interface PagedLayout {
  /** Top of each page (px), plus the end of the content. */
  offsets: number[];
  widths: number[];
  heights: number[];
  maxWidth: number;
  scale: number;
  /** Empty room (px) on each side of the pages, to move the view sideways into. */
  side: number;
}

export function buildLayout(pages: { width: number; height: number }[], scale: number, side = 0): PagedLayout {
  const offsets = [PADDING];
  for (const p of pages) offsets.push(offsets[offsets.length - 1] + p.height * scale + FOOTER + GAP);
  return {
    offsets,
    widths: pages.map((p) => p.width),
    heights: pages.map((p) => p.height),
    maxWidth: Math.max(...pages.map((p) => p.width), 1),
    scale,
    side,
  };
}

/** Pages are centered in a column as wide as the widest page, with empty room on both sides. */
export const pageLeft = (l: PagedLayout, i: number) => l.side + PADDING + ((l.maxWidth - l.widths[i]) * l.scale) / 2;

export function pageIndexAt(l: PagedLayout, y: number) {
  let i = 0;
  while (i < l.heights.length - 1 && l.offsets[i + 1] <= y) i++;
  return i;
}

/** A spot of the notebook (page and fractions within it) and where it is on screen. */
export interface Anchor {
  index: number;
  fx: number;
  fy: number;
  /** Screen position within the scroll viewport, px. */
  sx: number;
  sy: number;
}

/** The spot under screen point (sx, sy) of the viewport. */
export function anchorAt(l: PagedLayout, scrollLeft: number, scrollTop: number, sx: number, sy: number): Anchor {
  const x = scrollLeft + sx;
  const y = scrollTop + sy;
  const index = pageIndexAt(l, y);
  return {
    index,
    fx: (x - pageLeft(l, index)) / (l.widths[index] * l.scale),
    fy: (y - l.offsets[index]) / (l.heights[index] * l.scale),
    sx,
    sy,
  };
}

/** Scroll position that shows the anchored spot at its screen position. */
export function scrollFor(l: PagedLayout, a: Anchor) {
  return {
    left: pageLeft(l, a.index) + a.fx * l.widths[a.index] * l.scale - a.sx,
    top: l.offsets[a.index] + a.fy * l.heights[a.index] * l.scale - a.sy,
  };
}
