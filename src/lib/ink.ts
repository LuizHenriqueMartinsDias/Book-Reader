import { getStroke } from 'perfect-freehand';
import type { Point, Stroke } from '../db/schema';

export const MARKER_OPACITY = 0.35;

/** Outline polygon of a stroke, in the same space as its points. */
export function strokeOutline(stroke: Pick<Stroke, 'tool' | 'width' | 'points'>, last = true) {
  return getStroke(stroke.points, {
    size: stroke.width,
    thinning: stroke.tool === 'pen' ? 0.6 : 0,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    start: { cap: true },
    end: { cap: true },
    last,
  }) as [number, number][];
}

/** SVG path data for an outline polygon (quadratic curves through midpoints). */
export function outlineToSvgPath(points: [number, number][], map = (x: number, y: number) => [x, y]) {
  if (points.length < 2) return '';
  const p = points.map(([x, y]) => map(x, y));
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const m = mid(a, p[(i + 1) % p.length]);
    d += ` Q${f(a[0])},${f(a[1])} ${f(m[0])},${f(m[1])}`;
  }
  return d + ' Z';
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Pick<Stroke, 'tool' | 'width' | 'points' | 'color'>, last = true) {
  const path = new Path2D(outlineToSvgPath(strokeOutline(stroke, last)));
  ctx.save();
  if (stroke.tool === 'marker') {
    ctx.globalAlpha = MARKER_OPACITY;
    ctx.globalCompositeOperation = 'multiply';
  }
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();
}

/** True when the point is within `radius` of any segment of the stroke's centerline. */
export function strokeHit(points: Point[], x: number, y: number, radius: number) {
  if (points.length === 1) return Math.hypot(points[0][0] - x, points[0][1] - y) <= radius;
  for (let i = 1; i < points.length; i++) {
    if (distToSegment(x, y, points[i - 1], points[i]) <= radius) return true;
  }
  return false;
}

function distToSegment(px: number, py: number, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
