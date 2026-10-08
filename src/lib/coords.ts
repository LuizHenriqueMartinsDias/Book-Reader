import type { Rect } from '../db/schema';

/**
 * Annotations are stored in "view space at scale 1": PDF points measured from the top-left
 * corner of the page as displayed (crop box, with the page's /Rotate applied). This is what
 * pdf.js renders at `getViewport({ scale: 1 })`, so on screen a coordinate is just `v * scale`,
 * and annotations survive zoom changes untouched.
 */

/** [x1, y1, x2, y2] in PDF user space. */
export type ViewBox = [number, number, number, number];

/**
 * Returns a function mapping view-space points to PDF user space (origin bottom-left, y up),
 * matching pdf.js' PageViewport transform. Used when writing annotations into the PDF.
 */
export function viewToUserSpace(view: ViewBox, rotation: number) {
  const [x1, y1, x2, y2] = view;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return (vx: number, vy: number): [number, number] => [x1 + vy, y1 + vx];
    case 180:
      return (vx: number, vy: number): [number, number] => [x2 - vx, y1 + vy];
    case 270:
      return (vx: number, vy: number): [number, number] => [x2 - vy, y2 - vx];
    default:
      return (vx: number, vy: number): [number, number] => [x1 + vx, y2 - vy];
  }
}

/** Converts client rects (e.g. from a DOM Range) into page-relative PDF rects. */
export function clientRectsToPdf(rects: Iterable<DOMRectReadOnly>, pageBox: DOMRectReadOnly, scale: number): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    if (r.width < 1 || r.height < 1) continue;
    const x = Math.max(r.left, pageBox.left);
    const y = Math.max(r.top, pageBox.top);
    const right = Math.min(r.right, pageBox.right);
    const bottom = Math.min(r.bottom, pageBox.bottom);
    if (right <= x || bottom <= y) continue;
    out.push([(x - pageBox.left) / scale, (y - pageBox.top) / scale, (right - x) / scale, (bottom - y) / scale]);
  }
  return mergeLineRects(out);
}

/**
 * Text selections yield one rect per span, often overlapping or nested. Collapse rects
 * that sit on the same line and touch horizontally into a single rect per run.
 */
export function mergeLineRects(rects: Rect[], gap = 2): Rect[] {
  const sorted = [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const merged: Rect[] = [];
  for (const r of sorted) {
    const last = merged.find((m) => sameLine(m, r) && r[0] <= m[0] + m[2] + gap && m[0] <= r[0] + r[2] + gap);
    if (!last) {
      merged.push([...r]);
      continue;
    }
    const x = Math.min(last[0], r[0]);
    const y = Math.min(last[1], r[1]);
    const right = Math.max(last[0] + last[2], r[0] + r[2]);
    const bottom = Math.max(last[1] + last[3], r[1] + r[3]);
    last[0] = x;
    last[1] = y;
    last[2] = right - x;
    last[3] = bottom - y;
  }
  return merged;
}

function sameLine(a: Rect, b: Rect) {
  const overlap = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return overlap > 0.5 * Math.min(a[3], b[3]);
}
