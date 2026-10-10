import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Brush, Point, Stroke } from '../db/schema';

export const MARKER_OPACITY = 0.35;
/** A pencil line lets a little of what's under it through. */
export const PENCIL_OPACITY = 0.88;

type InkLike = Pick<Stroke, 'tool' | 'width' | 'points'> & { brush?: Brush; opacity?: number };

/** How opaque a stroke draws: the marker's and pencil's own see-through times the opacity picked for it. */
export const inkOpacity = (stroke: Pick<Stroke, 'tool' | 'opacity'> & { brush?: Brush }) =>
  (stroke.tool === 'marker' ? MARKER_OPACITY : stroke.brush === 'pencil' ? PENCIL_OPACITY : 1) * (stroke.opacity ?? 1);

/** How each kind of pen turns points and pressure into a shape. */
function brushOptions(stroke: InkLike): StrokeOptions {
  if (stroke.tool === 'marker') return { thinning: 0, smoothing: 0.5, streamline: 0.4 };
  switch (stroke.brush ?? 'pen') {
    case 'fineliner':
      return { thinning: 0, smoothing: 0.5, streamline: 0.45 };
    case 'brush': {
      const taper = stroke.width * 5;
      return { thinning: 0.82, smoothing: 0.6, streamline: 0.45, start: { taper, cap: true }, end: { taper, cap: true } };
    }
    case 'pencil':
      return { thinning: 0.3, smoothing: 0.65, streamline: 0.5 };
    default:
      return { thinning: 0.6, smoothing: 0.5, streamline: 0.4 };
  }
}

/** Outline polygon of a stroke, in the same space as its points. */
export function strokeOutline(stroke: InkLike, last = true) {
  return getStroke(stroke.points, {
    size: stroke.width,
    simulatePressure: false,
    start: { cap: true },
    end: { cap: true },
    ...brushOptions(stroke),
    last,
  }) as [number, number][];
}

// Pencil grain: a tile of the ink color with speckled transparency, made once per color.
const grainTiles = new Map<string, HTMLCanvasElement | null>();
const grainPatterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>();

function grainTile(color: string) {
  if (grainTiles.has(color)) return grainTiles.get(color)!;
  const size = 48;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d');
  if (!ctx) {
    grainTiles.set(color, null);
    return null;
  }
  const [r, g, b] = hexToRgb(color).map((c) => Math.round(c * 255));
  const img = ctx.createImageData(size, size);
  // A fixed pseudo-random sequence, so the grain looks the same every time it's drawn.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < size * size; i++) {
    const n = rand();
    img.data.set([r, g, b, Math.round(255 * (n < 0.12 ? 0.15 : 0.55 + 0.45 * rand()))], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  grainTiles.set(color, tile);
  return tile;
}

function pencilFill(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  let byColor = grainPatterns.get(ctx);
  if (!byColor) grainPatterns.set(ctx, (byColor = new Map()));
  if (!byColor.has(color)) {
    const tile = grainTile(color);
    const pattern = tile && ctx.createPattern(tile, 'repeat');
    // Grains of about half a point on the page.
    pattern?.setTransform?.(new DOMMatrix().scale(0.5));
    byColor.set(color, pattern ?? null);
  }
  return byColor.get(color) ?? color;
}

/** Fills a stroke's outline the way its tool and pen look. */
export function fillInk(ctx: CanvasRenderingContext2D, path: Path2D, stroke: Pick<Stroke, 'tool' | 'color' | 'opacity'> & { brush?: Brush }) {
  ctx.save();
  ctx.globalAlpha = inkOpacity(stroke);
  if (stroke.tool === 'marker') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = stroke.color;
  } else if (stroke.brush === 'pencil') {
    ctx.fillStyle = pencilFill(ctx, stroke.color);
  } else ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();
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

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: InkLike & Pick<Stroke, 'color'>, last = true) {
  fillInk(ctx, new Path2D(outlineToSvgPath(strokeOutline(stroke, last))), stroke);
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
