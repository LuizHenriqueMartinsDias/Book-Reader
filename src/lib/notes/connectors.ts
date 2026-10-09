import type { ConnectorEnd, ConnectorItem, NodeItem, NoteItem } from '../../db/schema';
import { strokeHit } from '../ink';
import { nodeOutline, type Vec } from './geometry';

/**
 * Diagram arrows. An arrow stores which boxes its ends are on; its path is worked out here from
 * where the boxes are now, so it follows them (also while one is being dragged).
 */

export type Side = 'left' | 'right' | 'top' | 'bottom';
export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const DIR: Record<Side, Vec> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const OPPOSITE: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

export const isConnector = (i: NoteItem): i is ConnectorItem => i.type === 'connector';

export const nodesById = (items: NoteItem[]) => new Map(items.filter((i): i is NodeItem => i.type === 'node').map((n) => [n.id, n]));

const center = (n: NodeItem): Vec => [n.x + n.w / 2, n.y + n.h / 2];

/** Middle of one side of a box (on its edge, whatever its shape). */
export function sidePoint(n: NodeItem, side: Side): Vec {
  const [cx, cy] = center(n);
  if (side === 'left') return [n.x, cy];
  if (side === 'right') return [n.x + n.w, cy];
  if (side === 'top') return [cx, n.y];
  return [cx, n.y + n.h];
}

export const sideDir = (side: Side) => DIR[side];

/** Where the line from a box's center toward `target` crosses its edge. */
function edgeToward(n: NodeItem, target: Vec): Vec {
  const [cx, cy] = center(n);
  const [dx, dy] = [target[0] - cx, target[1] - cy];
  const outline = nodeOutline(n);
  let best = Infinity;
  for (let i = 1; i < outline.length; i++) {
    const [ax, ay] = outline[i - 1];
    const [bx, by] = outline[i];
    const [ex, ey] = [bx - ax, by - ay];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - cx) * ey - (ay - cy) * ex) / den;
    const u = ((ax - cx) * dy - (ay - cy) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  // A target inside the box: there's no edge to stop at before it.
  return best <= 1 ? [cx + dx * best, cy + dy * best] : target;
}

/** The point an end sits at when it isn't on a box, and its box when it is (and still exists). */
const endBox = (end: ConnectorEnd, nodes: Map<string, NodeItem>) => (end.node ? nodes.get(end.node) : undefined);

/** The arrow's path, from its start to its tip, as points. */
export function connectorPoints(c: Pick<ConnectorItem, 'from' | 'to' | 'route'>, nodes: Map<string, NodeItem>): Vec[] {
  const a = endBox(c.from, nodes);
  const b = endBox(c.to, nodes);
  const ca: Vec = a ? center(a) : [c.from.x, c.from.y];
  const cb: Vec = b ? center(b) : [c.to.x, c.to.y];

  if (c.route === 'straight') return [a ? edgeToward(a, cb) : ca, b ? edgeToward(b, ca) : cb];

  // Elbow and curve leave and enter through the sides facing each other.
  const horizontal = Math.abs(cb[0] - ca[0]) >= Math.abs(cb[1] - ca[1]);
  const sideA: Side = horizontal ? (cb[0] >= ca[0] ? 'right' : 'left') : cb[1] >= ca[1] ? 'bottom' : 'top';
  const sideB = OPPOSITE[sideA];
  const pa = a ? sidePoint(a, sideA) : ca;
  const pb = b ? sidePoint(b, sideB) : cb;

  if (c.route === 'elbow') {
    if (horizontal ? pa[1] === pb[1] : pa[0] === pb[0]) return [pa, pb];
    const mx = (pa[0] + pb[0]) / 2;
    const my = (pa[1] + pb[1]) / 2;
    return horizontal ? [pa, [mx, pa[1]], [mx, pb[1]], pb] : [pa, [pa[0], my], [pb[0], my], pb];
  }

  // Curve: a cubic leaving and arriving straight out of the sides.
  const d = Math.max(30, Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2);
  const c1: Vec = [pa[0] + DIR[sideA][0] * d, pa[1] + DIR[sideA][1] * d];
  const c2: Vec = [pb[0] + DIR[sideB][0] * d, pb[1] + DIR[sideB][1] * d];
  return Array.from({ length: 33 }, (_, i): Vec => {
    const t = i / 32;
    const u = 1 - t;
    return [
      u * u * u * pa[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * pb[0],
      u * u * u * pa[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * pb[1],
    ];
  });
}

/** The point halfway along a path (where the arrow's text goes). */
export function midpoint(points: Vec[]): Vec {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let left = lengths.reduce((s, l) => s + l, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const t = left / lengths[i];
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
    }
    left -= lengths[i];
  }
  return points[0];
}

/** The two barb ends of an arrow head at `tip`, pointing away from `from`. */
export function barbs(tip: Vec, from: Vec, width: number): [Vec, Vec] {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const size = width * 3 + 8;
  const spread = Math.PI / 7;
  return [
    [tip[0] - size * Math.cos(angle - spread), tip[1] - size * Math.sin(angle - spread)],
    [tip[0] - size * Math.cos(angle + spread), tip[1] - size * Math.sin(angle + spread)],
  ];
}

/** Arrow heads to draw: [tip, the point it comes from] for each end that has one. */
export function heads(c: Pick<ConnectorItem, 'arrows'>, points: Vec[]): [Vec, Vec][] {
  const n = points.length;
  const out: [Vec, Vec][] = [];
  if (c.arrows !== 'none') out.push([points[n - 1], points[n - 2]]);
  if (c.arrows === 'both') out.push([points[0], points[1]]);
  return out;
}

export function connectorHit(c: ConnectorItem, nodes: Map<string, NodeItem>, x: number, y: number, radius: number) {
  return strokeHit(connectorPoints(c, nodes).map(([px, py]) => [px, py, 0.5]), x, y, radius + c.width / 2);
}

/** Arrows with an end on one of these boxes. */
export const attachedTo = (items: NoteItem[], nodeIds: Set<string>) =>
  items.filter(isConnector).filter((c) => (c.from.node && nodeIds.has(c.from.node)) || (c.to.node && nodeIds.has(c.to.node)));

/** The arrow with its ends' (x, y) updated to where they are now; the same object if unchanged. */
export function settle(c: ConnectorItem, nodes: Map<string, NodeItem>): ConnectorItem {
  const pts = connectorPoints(c, nodes);
  const [from, to] = [pts[0], pts[pts.length - 1]];
  if (from[0] === c.from.x && from[1] === c.from.y && to[0] === c.to.x && to[1] === c.to.y) return c;
  return { ...c, from: { ...c.from, x: from[0], y: from[1] }, to: { ...c.to, x: to[0], y: to[1] } };
}
