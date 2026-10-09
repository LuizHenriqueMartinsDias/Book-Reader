import type { NoteItem, Point } from '../../db/schema';
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

/** Ink the eraser touches: strokes and shapes (text and images need the lasso to delete). */
export function eraserHits(items: NoteItem[], x: number, y: number, radius: number) {
  return items.filter((i) => {
    if (i.type === 'stroke') return strokeHit(i.points, x, y, radius + i.width / 2);
    if (i.type === 'shape') return strokeHit(shapePoints(i), x, y, radius + i.width / 2);
    return false;
  });
}
