import type { NodeItem, NoteItem, Point } from '../../db/schema';
import { strokeHit } from '../ink';

export type Vec = [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Height of a text box that hasn't been measured on screen yet. */
export function estimateTextHeight(text: string, fontSize: number, width: number) {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return lines * fontSize * 1.35 + 8;
}

export function bboxOf(item: NoteItem): Box {
  switch (item.type) {
    case 'stroke': {
      const xs = item.points.map((p) => p[0]);
      const ys = item.points.map((p) => p[1]);
      const pad = item.width / 2;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
    }
    case 'shape': {
      const pad = item.width / 2 + (item.shape === 'arrow' ? item.width * 3 + 6 : 0);
      const x = Math.min(item.x1, item.x2) - pad;
      const y = Math.min(item.y1, item.y2) - pad;
      return { x, y, w: Math.abs(item.x2 - item.x1) + 2 * pad, h: Math.abs(item.y2 - item.y1) + 2 * pad };
    }
    case 'text':
      return { x: item.x, y: item.y, w: item.w, h: item.h ?? estimateTextHeight(item.text, item.fontSize, item.w) };
    case 'image':
      return { x: item.x, y: item.y, w: item.w, h: item.h };
    case 'node': {
      const pad = item.width / 2;
      return { x: item.x - pad, y: item.y - pad, w: item.w + 2 * pad, h: item.h + 2 * pad };
    }
  }
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function pointInPolygon([x, y]: Vec, poly: Vec[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Items caught by a lasso: strokes with most of their points inside, other items by their center. */
export function itemsInLasso(items: NoteItem[], lasso: Vec[]): NoteItem[] {
  if (lasso.length < 3) return [];
  return items.filter((item) => {
    if (item.type === 'stroke') {
      const inside = item.points.filter((p) => pointInPolygon([p[0], p[1]], lasso)).length;
      return inside >= Math.max(1, item.points.length / 2);
    }
    if (item.type === 'shape') return pointInPolygon([item.x1, item.y1], lasso) && pointInPolygon([item.x2, item.y2], lasso);
    const b = bboxOf(item);
    return pointInPolygon([b.x + b.w / 2, b.y + b.h / 2], lasso);
  });
}

/** Moves by (dx, dy) and scales by `scale` around `origin`; sizes (widths, fonts) scale too. */
export interface Transform {
  dx: number;
  dy: number;
  scale: number;
  origin: Vec;
}

export function transformItems(items: NoteItem[], { dx, dy, scale, origin }: Transform): NoteItem[] {
  const tx = (x: number) => origin[0] + (x - origin[0]) * scale + dx;
  const ty = (y: number) => origin[1] + (y - origin[1]) * scale + dy;
  return items.map((item): NoteItem => {
    switch (item.type) {
      case 'stroke':
        return { ...item, width: item.width * scale, points: item.points.map(([x, y, p]): Point => [tx(x), ty(y), p]) };
      case 'shape':
        return { ...item, width: item.width * scale, x1: tx(item.x1), y1: ty(item.y1), x2: tx(item.x2), y2: ty(item.y2) };
      case 'text':
        return { ...item, x: tx(item.x), y: ty(item.y), w: item.w * scale, h: item.h && item.h * scale, fontSize: item.fontSize * scale };
      case 'image':
        return { ...item, x: tx(item.x), y: ty(item.y), w: item.w * scale, h: item.h * scale };
      case 'node':
        return { ...item, x: tx(item.x), y: ty(item.y), w: item.w * scale, h: item.h * scale, width: item.width * scale, fontSize: item.fontSize * scale };
    }
  });
}

/** Outline of a shape as points, for hit-testing. */
export function shapePoints(item: Extract<NoteItem, { type: 'shape' }>): Point[] {
  const { x1, y1, x2, y2 } = item;
  if (item.shape === 'line' || item.shape === 'arrow') return [[x1, y1, 0.5], [x2, y2, 0.5]];
  if (item.shape === 'rect') return [[x1, y1, 0.5], [x2, y1, 0.5], [x2, y2, 0.5], [x1, y2, 0.5], [x1, y1, 0.5]];
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  return Array.from({ length: 49 }, (_, i): Point => {
    const t = (i / 48) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0.5];
  });
}

/**
 * Outline of a diagram box as a closed polygon (first point repeated at the end), for drawing
 * it in a PDF, hit-testing and telling what's inside.
 */
export function nodeOutline(n: Pick<NodeItem, 'shape' | 'x' | 'y' | 'w' | 'h'>): Vec[] {
  const { x, y, w, h } = n;
  const close = (pts: Vec[]) => [...pts, pts[0]];
  if (n.shape === 'rect') return close([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  if (n.shape === 'diamond') return close([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
  if (n.shape === 'ellipse') {
    return close(Array.from({ length: 64 }, (_, i): Vec => {
      const t = (i / 64) * Math.PI * 2;
      return [x + w / 2 + (w / 2) * Math.cos(t), y + h / 2 + (h / 2) * Math.sin(t)];
    }));
  }
  // Rounded rectangle: a quarter circle at each corner.
  const r = nodeRadius(n);
  const corner = (cx: number, cy: number, from: number): Vec[] =>
    Array.from({ length: 7 }, (_, i): Vec => {
      const t = ((from + i * 15) * Math.PI) / 180;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    });
  return close([...corner(x + w - r, y + r, 270), ...corner(x + w - r, y + h - r, 0), ...corner(x + r, y + h - r, 90), ...corner(x + r, y + r, 180)]);
}

/** Corner radius of a rounded box. */
export const nodeRadius = (n: Pick<NodeItem, 'w' | 'h'>) => Math.min(16, n.w / 4, n.h / 4);

/** Ink the eraser touches: strokes, shapes and box outlines (text and images need the lasso to delete). */
export function eraserHits(items: NoteItem[], x: number, y: number, radius: number) {
  return items.filter((i) => {
    if (i.type === 'stroke') return strokeHit(i.points, x, y, radius + i.width / 2);
    if (i.type === 'shape') return strokeHit(shapePoints(i), x, y, radius + i.width / 2);
    // A box is erased by its outline, so erasing what's written inside it leaves the box.
    if (i.type === 'node') return strokeHit(nodeOutline(i).map(([px, py]): Point => [px, py, 0.5]), x, y, radius + i.width / 2);
    return false;
  });
}

/** Rotates a vector by `deg` degrees (clockwise on screen, where y points down). */
export function rotateVec([x, y]: Vec, deg: number): Vec {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

/**
 * A point on screen to px within an element of size w×h that is CSS-rotated by `deg` around its
 * center (`center` is where that center is on screen; rotation keeps it in place).
 */
export function screenToLocal(client: Vec, center: Vec, deg: number, w: number, h: number): Vec {
  const [dx, dy] = rotateVec([client[0] - center[0], client[1] - center[1]], -deg);
  return [dx + w / 2, dy + h / 2];
}

/** Snaps an angle (degrees) to the nearest quarter turn when within `tolerance`, normalized to (-180, 180]. */
export function snapQuarter(deg: number, tolerance = 4) {
  const quarter = Math.round(deg / 90) * 90;
  const snapped = Math.abs(deg - quarter) <= tolerance ? quarter : deg;
  const n = ((snapped % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
}
