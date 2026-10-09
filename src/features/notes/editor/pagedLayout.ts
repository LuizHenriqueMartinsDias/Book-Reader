/** Geometry of the paged notebook's scroll content: where each page sits at a given scale. */

export const GAP = 12;
export const FOOTER = 34;
export const PADDING = 16;

export interface PagedLayout {
  /** Top of each page (px), plus the end of the content. */
  offsets: number[];
  widths: number[];
  heights: number[];
  maxWidth: number;
  scale: number;
}

export function buildLayout(pages: { width: number; height: number }[], scale: number): PagedLayout {
  const offsets = [PADDING];
  for (const p of pages) offsets.push(offsets[offsets.length - 1] + p.height * scale + FOOTER + GAP);
  return {
    offsets,
    widths: pages.map((p) => p.width),
    heights: pages.map((p) => p.height),
    maxWidth: Math.max(...pages.map((p) => p.width), 1),
    scale,
  };
}

/** Pages are centered in a column as wide as the widest page. */
export const pageLeft = (l: PagedLayout, i: number) => PADDING + ((l.maxWidth - l.widths[i]) * l.scale) / 2;

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
