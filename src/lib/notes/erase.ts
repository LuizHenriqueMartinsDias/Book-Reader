import type { NoteItem, Point, ShapeItem, StrokeItem } from '../../db/schema';
import { shapePoints } from './geometry';
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
  const dense = densify(points, Math.max(0.5, radius / 3));
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
  const lines = item.type === 'stroke' ? [item.points] : shapeAsStrokes(item);
  const reach = radius + item.width / 2;
  const cut = lines.map((points) => cutPoints(points, x, y, reach));
  if (cut.every((c) => c === null)) return null;
  const base = { notebookId: item.notebookId, pageId: item.pageId, z: item.z, createdAt: item.createdAt, color: item.color, width: item.width, ...(item.parentId ? { parentId: item.parentId } : {}) };
  const tool = item.type === 'stroke' ? item.tool : 'pen';
  const brush = item.type === 'stroke' && item.brush ? { brush: item.brush } : {};
  return cut.flatMap((runs, i) => runs ?? [lines[i]]).map((points) => ({ ...base, ...brush, id: newId(), type: 'stroke', tool, points }));
}
