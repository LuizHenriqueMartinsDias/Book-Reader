import type { NoteItem, Point, ShapeItem, StrokeItem } from '../../db/schema';
import { distToSegment } from '../ink';
import { cachedBox, shapePoints, unionBox, type Box } from './geometry';
import { arrowHead } from './render';

/**
 * The "normal" eraser: it rubs out only the ink under it, cutting strokes into the pieces left
 * on either side. Shapes become pen strokes when first touched so they can be cut the same way.
 */

/** Inserts points so no two neighbors are more than `step` apart (pressure interpolated). */
export function densify(points: Point[], step: number): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, ap] = points[i - 1];
    const [bx, by, bp] = points[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t]);
    }
    out.push(points[i]);
  }
  return out;
}

/**
 * What's left of a stroke's centerline after erasing a disc at (x, y): the runs of points outside
 * it, or null when the disc doesn't reach the stroke. `radius` should include half the ink width.
 */
export function cutPoints(points: Point[], x: number, y: number, radius: number): Point[][] | null {
  const step = Math.max(0.5, radius / 3);
  // Only the segments near the eraser are filled in finely enough to cut; the rest keep their
  // points, so a long stroke costs little and its pieces don't grow with every pass.
  const dense: Point[] = points.slice(0, 1);
  let near = points.length === 1 && Math.hypot(points[0][0] - x, points[0][1] - y) <= radius;
  for (let i = 1; i < points.length; i++) {
    if (distToSegment(x, y, points[i - 1], points[i]) > radius + step) dense.push(points[i]);
    else {
      near = true;
      dense.push(...densify([points[i - 1], points[i]], step).slice(1));
    }
  }
  if (!near) return null;
  const inside = dense.map(([px, py]) => Math.hypot(px - x, py - y) <= radius);
  if (!inside.includes(true)) return null;
  const runs: Point[][] = [];
  let run: Point[] = [];
  dense.forEach((p, i) => {
    if (!inside[i]) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  // A lone point left at a cut is a speck, not ink worth keeping.
  return runs.filter((r) => r.length > 1);
}

/** A shape drawn as pen strokes of the same width (pressure 0.5 draws exactly `width`). */
export function shapeAsStrokes(s: ShapeItem): Point[][] {
  const lines = [shapePoints(s)];
  if (s.shape === 'arrow') {
    const [a, b] = arrowHead(s);
    lines.push([[a[0], a[1], 0.5], [s.x2, s.y2, 0.5], [b[0], b[1], 0.5]]);
  }
  return lines;
}

/**
 * The pieces an ink item turns into when the eraser disc at (x, y) touches it, or null when it
 * doesn't. Text and images aren't affected. `newId` names each piece.
 */
export function eraseItem(item: NoteItem, x: number, y: number, radius: number, newId: () => string): StrokeItem[] | null {
  if (item.type !== 'stroke' && item.type !== 'shape') return null;
  const reach = radius + item.width / 2;
  // Most of the page is far from the eraser: its box (which includes the ink's width) rules it out.
  const b = cachedBox(item);
  if (x < b.x - radius || y < b.y - radius || x > b.x + b.w + radius || y > b.y + b.h + radius) return null;
  const lines = item.type === 'stroke' ? [item.points] : shapeAsStrokes(item);
  const cut = lines.map((points) => cutPoints(points, x, y, reach));
  if (cut.every((c) => c === null)) return null;
  const base = { notebookId: item.notebookId, pageId: item.pageId, z: item.z, createdAt: item.createdAt, color: item.color, width: item.width, ...(item.parentId ? { parentId: item.parentId } : {}) };
  const tool = item.type === 'stroke' ? item.tool : 'pen';
  const brush = item.type === 'stroke' && item.brush ? { brush: item.brush } : {};
  return cut.flatMap((runs, i) => runs ?? [lines[i]]).map((points) => ({ ...base, ...brush, id: newId(), type: 'stroke', tool, points }));
}

/** What the eraser has done so far: the saved items it hides and the pieces shown in their place. */
export interface EraseState {
  erasing: Set<string>;
  pieces: StrokeItem[];
}

/** Plain ink: drawn on its own, with nothing else (a box, a post-it) deciding how it looks. */
export const plainInk = (i: NoteItem): i is StrokeItem | ShapeItem => (i.type === 'stroke' || i.type === 'shape') && !i.parentId;

/**
 * Where the page looks different from `before` to `after`: around the items just hidden and the
 * pieces that changed, padded for the ink's width. Null when nothing changed; undefined when
 * something other than plain ink did (the whole page has to be drawn again).
 */
export function erasedArea(before: EraseState, after: EraseState, items: Map<string, NoteItem>): Box | null | undefined {
  const changed: NoteItem[] = [];
  for (const id of after.erasing) if (!before.erasing.has(id)) changed.push(items.get(id)!);
  for (const id of before.erasing) if (!after.erasing.has(id)) changed.push(items.get(id)!);
  const was = new Set(before.pieces);
  const is = new Set(after.pieces);
  changed.push(...before.pieces.filter((p) => !is.has(p)), ...after.pieces.filter((p) => !was.has(p)));
  if (!changed.length) return null;
  if (!changed.every((i) => i && plainInk(i))) return undefined;
  const area = unionBox(changed.map(cachedBox))!;
  // Brushes can spread a little past half their width.
  const pad = Math.max(...changed.map((i) => (i as StrokeItem | ShapeItem).width)) + 2;
  return { x: area.x - pad, y: area.y - pad, w: area.w + 2 * pad, h: area.h + 2 * pad };
}
