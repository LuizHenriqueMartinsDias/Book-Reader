/**
 * The ruler is a bar on screen (host-element px): centered at (x, y), rotated by `angle`
 * (degrees, clockwise), `length` long and `width` thick. Strokes drawn next to one of its long
 * edges are projected onto that edge, so they come out straight.
 */
export interface Ruler {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
}

type P = [number, number];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Ruler-local coordinates: u along the ruler from its center, v across it. */
export function toRulerSpace(r: Ruler, [px, py]: P): P {
  const a = rad(r.angle);
  const dx = px - r.x;
  const dy = py - r.y;
  return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
}

export function fromRulerSpace(r: Ruler, [u, v]: P): P {
  const a = rad(r.angle);
  return [r.x + u * Math.cos(a) - v * Math.sin(a), r.y + u * Math.sin(a) + v * Math.cos(a)];
}

export function onRuler(r: Ruler, p: P) {
  const [u, v] = toRulerSpace(r, p);
  return Math.abs(u) <= r.length / 2 && Math.abs(v) <= r.width / 2;
}

/** Edge -1 is the top side (v = -width/2), +1 the bottom side. */
export type Edge = -1 | 1;

/**
 * The edge a stroke starting at `p` should follow: when `p` is outside the ruler but within
 * `reach` px of a long edge, along its length. Otherwise null (draw freely).
 */
export function edgeNear(r: Ruler, p: P, reach: number): Edge | null {
  const [u, v] = toRulerSpace(r, p);
  if (Math.abs(u) > r.length / 2 + reach) return null;
  const half = r.width / 2;
  if (v < -half && v > -half - reach) return -1;
  if (v > half && v < half + reach) return 1;
  return null;
}

/** Projects `p` onto the chosen edge line (extending past the ruler's ends). */
export function projectOnEdge(r: Ruler, p: P, edge: Edge): P {
  const [u] = toRulerSpace(r, p);
  return fromRulerSpace(r, [u, (edge * r.width) / 2]);
}

/** Snaps angles within `tolerance` degrees of a multiple of 15° (0, 15, 30, 45, 90…). */
export function snapAngle(angle: number, tolerance = 2.5) {
  const normalized = ((angle % 360) + 360) % 360;
  const nearest = Math.round(normalized / 15) * 15;
  return Math.abs(normalized - nearest) <= tolerance ? nearest % 360 : normalized;
}

/** Angle shown to the user: 0–180°, like a protractor. */
export const displayAngle = (angle: number) => Math.round(((angle % 180) + 180) % 180);
