/**
 * Geometry of a page curling over like paper (the classic 2D "turn.js" fold).
 *
 * Everything is in the leaf's own pixel space: the turning page spans [0,w]×[0,h] with the
 * spine on its left edge (x = 0). A left-hand leaf is handled by mirroring (see `curlLeft`).
 * When the corner `c` is dragged to `p`, the fold line is the perpendicular bisector of c–p:
 * the part of the leaf on c's side is folded over and its back lands reflected across the line.
 */

export type Vec = [number, number];
export type Polygon = Vec[];
/** CSS `matrix(a, b, c, d, e, f)`: (x, y) → (a·x + c·y + e, b·x + d·y + f). */
export type Matrix = [number, number, number, number, number, number];

export interface Curl {
  /** Where the dragged corner actually is, after keeping the leaf attached to the spine. */
  point: Vec;
  /** Visible part of the leaf's front, in its own coordinates. */
  front: Polygon;
  /** Uncovered area where the page underneath shows, in leaf coordinates. */
  exposed: Polygon;
  /** Transform placing the back page (laid out like a normal page) onto the folded flap. */
  backMatrix: Matrix;
  /** Clip for the back page, in the back page's own coordinates. */
  backClip: Polygon;
  /** The flap as it appears on screen (leaf coordinates), for shading. */
  flap: Polygon;
  /** A point on the fold line and the unit normal pointing toward the uncovered side. */
  fold: { origin: Vec; normal: Vec };
  /** 0 = flat, 1 = fully turned. */
  progress: number;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const len = (a: Vec) => Math.hypot(a[0], a[1]);

/**
 * The leaf is bound at the spine: each spine corner must stay within the distance it has
 * to the grabbed corner, or the paper would tear off the binding.
 */
export function constrainPoint(corner: Vec, p: Vec, h: number): Vec {
  // The spine corner on the grabbed corner's edge binds tightest, so project onto it first;
  // a second pass settles points that the other projection pushed back out.
  const spines = ([[0, 0], [0, h]] as Vec[])
    .map((spine) => ({ spine, radius: len(sub(corner, spine)) }))
    .sort((a, b) => a.radius - b.radius);
  let out = p;
  for (let pass = 0; pass < 2; pass++) {
    for (const { spine, radius } of spines) {
      const d = sub(out, spine);
      const dist = len(d);
      if (dist > radius) out = add(spine, mul(d, radius / dist));
    }
  }
  return out;
}

/** Keeps the part of a convex polygon where dot(x − origin, normal) ≤ 0. */
export function clipHalfPlane(poly: Polygon, origin: Vec, normal: Vec): Polygon {
  const side = (v: Vec) => dot(sub(v, origin), normal);
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) out.push(add(a, mul(sub(b, a), sa / (sa - sb))));
  }
  return out;
}

export function applyMatrix([a, b, c, d, e, f]: Matrix, [x, y]: Vec): Vec {
  return [a * x + c * y + e, b * x + d * y + f];
}

export function computeCurl(corner: Vec, target: Vec, w: number, h: number): Curl {
  const rect: Polygon = [[0, 0], [w, 0], [w, h], [0, h]];
  const point = constrainPoint(corner, target, h);
  const delta = sub(corner, point);
  const dist = len(delta);

  if (dist < 0.5) {
    return { point, front: rect, exposed: [], backMatrix: [-1, 0, 0, 1, 2 * w, 0], backClip: [], flap: [], fold: { origin: corner, normal: [1, 0] }, progress: 0 };
  }

  const normal = mul(delta, 1 / dist); // toward the corner, i.e. the folded side
  const origin = mul(add(corner, point), 0.5);
  const front = clipHalfPlane(rect, origin, normal);
  const exposed = clipHalfPlane(rect, origin, mul(normal, -1));

  // Reflection across the fold: x → L·x + t, with L = I − 2nnᵀ and t = 2(origin·n)n.
  const [nx, ny] = normal;
  const L = [1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny];
  const k = 2 * dot(origin, normal);
  const t: Vec = [k * nx, k * ny];
  const reflect = (v: Vec): Vec => [L[0] * v[0] + L[1] * v[1] + t[0], L[2] * v[0] + L[3] * v[1] + t[1]];

  // The back page's point (u, v) is the leaf's point (w − u, v), then reflected. Two
  // reflections compose to a rotation, so the back's content reads the right way round.
  const backMatrix: Matrix = [-L[0], -L[2], L[1], L[3], L[0] * w + t[0], L[2] * w + t[1]];
  const backClip = exposed.map(([x, y]): Vec => [w - x, y]);
  const flap = exposed.map(reflect);

  return { point, front, exposed, backMatrix, backClip, flap, fold: { origin, normal: mul(normal, 1) }, progress: Math.min(1, (corner[0] - point[0]) / (2 * w)) };
}

/** Same as computeCurl for a left-hand leaf (spine on its right edge), by mirroring x. */
export function curlLeft(corner: Vec, target: Vec, w: number, h: number): Curl {
  const m = ([x, y]: Vec): Vec => [w - x, y];
  const r = computeCurl(m(corner), m(target), w, h);
  const [a, b, c, d, e, f] = r.backMatrix;
  return {
    point: m(r.point),
    front: r.front.map(m),
    exposed: r.exposed.map(m),
    // M∘T∘M with M(x, y) = (w − x, y)
    backMatrix: [a, -b, -c, d, w - e - a * w, f + b * w],
    backClip: r.backClip.map(m),
    flap: r.flap.map(m),
    fold: { origin: m(r.fold.origin), normal: [-r.fold.normal[0], r.fold.normal[1]] },
    progress: r.progress,
  };
}

export const polygonCss = (poly: Polygon) =>
  poly.length ? `polygon(${poly.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(', ')})` : 'polygon(0 0)';

export const matrixCss = (m: Matrix) => `matrix(${m.map((n) => n.toFixed(5)).join(', ')})`;
