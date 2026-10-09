import type { ShapeKind } from '../../db/schema';

type P = [number, number];
export interface RecognizedShape {
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pathLength = (pts: P[]) => pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1], p) : 0), 0);

function distToLine(p: P, a: P, b: P) {
  const len = dist(a, b);
  if (len === 0) return dist(p, a);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
}

/** Snaps nearly horizontal/vertical lines (within ~8°). */
function snapLine(a: P, b: P): [P, P] {
  const angle = Math.abs((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180;
  if (angle < 8 || angle > 172) return [a, [b[0], a[1]]];
  if (Math.abs(angle - 90) < 8) return [a, [a[0], b[1]]];
  return [a, b];
}

/**
 * Turns a hand-drawn stroke into a perfect line, rectangle or ellipse when it is close enough
 * ("draw and hold"); returns null for anything else.
 */
export function recognizeShape(points: P[]): RecognizedShape | null {
  if (points.length < 2) return null;
  const length = pathLength(points);
  if (length < 20) return null;
  const first = points[0];
  const last = points[points.length - 1];

  // Line: the path stays close to the chord between its ends.
  const chord = dist(first, last);
  if (chord > 0.8 * length) {
    const maxDev = Math.max(...points.map((p) => distToLine(p, first, last)));
    if (maxDev < Math.max(4, 0.08 * chord)) {
      const [a, b] = snapLine(first, last);
      return { shape: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    }
    return null;
  }

  // Closed shapes: the ends meet and the path goes all the way around its center; then see
  // whether a box or an ellipse fits the points better.
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  const y1 = Math.min(...ys);
  const y2 = Math.max(...ys);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < 10 || h < 10) return null;
  if (chord > 0.25 * Math.max(w, h)) return null;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const octants = new Set(points.map(([x, y]) => Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 8) % 8));
  if (octants.size < 8) return null;
  const rx = w / 2;
  const ry = h / 2;
  const scale = Math.min(w, h);

  const rectError = points.reduce((sum, [x, y]) => sum + Math.min(Math.abs(x - x1), Math.abs(x - x2), Math.abs(y - y1), Math.abs(y - y2)), 0) / points.length / scale;
  const ellipseError =
    points.reduce((sum, [x, y]) => sum + Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry), 0) / points.length / scale;

  const best = rectError < ellipseError ? 'rect' : 'ellipse';
  if (Math.min(rectError, ellipseError) > 0.06) return null;
  return { shape: best, x1, y1, x2, y2 };
}
