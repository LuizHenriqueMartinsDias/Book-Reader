import type { NodeItem, NodeShape, NoteItem, StickyItem } from '../../db/schema';
import { attachedTo, isConnector } from './connectors';
import { nodeOutline, pointInPolygon, unionBox, type Box, type Vec } from './geometry';
import { closedFit } from './shapes';
import { isSticky } from './sticky';

/**
 * Diagram boxes: sizes, what's inside one, and the handwriting that belongs to it. Ink written
 * inside a box records it as `parentId`, so it moves and resizes with the box and is deleted
 * with it.
 */

/** Size of a box made with a tap, in points. */
export const NODE_SIZE: Record<NodeShape, { w: number; h: number }> = {
  rect: { w: 150, h: 70 },
  round: { w: 150, h: 70 },
  ellipse: { w: 150, h: 84 },
  diamond: { w: 160, h: 100 },
};
/** Dragging a smaller box than this makes the tap-sized one instead. */
export const MIN_NODE = 24;

export const isNode = (i: NoteItem): i is NodeItem => i.type === 'node';

export const pointInNode = (n: NodeItem, p: Vec) => pointInPolygon(p, nodeOutline(n));

/** The topmost box under a point. */
export const nodeAt = (items: NoteItem[], p: Vec) =>
  items
    .filter(isNode)
    .sort((a, b) => b.z - a.z)
    .find((n) => pointInNode(n, p));

/** Where a box's text goes: inset so it stays inside round and pointed shapes. */
export function nodeTextBox(n: NodeItem): Box {
  const [fx, fy] = n.shape === 'diamond' ? [0.22, 0.2] : n.shape === 'ellipse' ? [0.14, 0.12] : [0.04, 0.06];
  const px = Math.max(4, n.w * fx);
  const py = Math.max(3, n.h * fy);
  return { x: n.x + px, y: n.y + py, w: Math.max(10, n.w - 2 * px), h: Math.max(10, n.h - 2 * py) };
}

/** Points of a piece of ink, to tell whether it was written inside a box. */
function inkPoints(i: NoteItem): Vec[] | null {
  if (i.type === 'stroke') return i.points.map(([x, y]) => [x, y]);
  if (i.type === 'shape') return [[i.x1, i.y1], [i.x2, i.y2]];
  return null;
}

/** What writing can belong to: diagram boxes and open post-its (which lie over everything else). */
function containers(items: NoteItem[]) {
  const all = items.filter((i): i is NodeItem | StickyItem => isNode(i) || (isSticky(i) && !i.collapsed));
  return all.sort((a, b) => Number(isSticky(b)) - Number(isSticky(a)) || b.z - a.z);
}

const outlineOf = (c: NodeItem | StickyItem): Vec[] =>
  isSticky(c)
    ? [
        [c.x, c.y],
        [c.x + c.w, c.y],
        [c.x + c.w, c.y + c.h],
        [c.x, c.y + c.h],
      ]
    : nodeOutline(c);

/** The box or post-it a stroke or shape was written in (most of it inside; the one on top wins), if any. */
export function parentFor(ink: NoteItem, items: NoteItem[]): string | undefined {
  const pts = inkPoints(ink);
  if (!pts?.length) return undefined;
  return containers(items.filter((i) => i.id !== ink.id)).find((c) => {
    const outline = outlineOf(c);
    return pts.filter((p) => pointInPolygon(p, outline)).length >= pts.length * 0.6;
  })?.id;
}

/** `ink` belonging to the box it now sits in (or to none). */
export function attach<T extends NoteItem>(ink: T, items: NoteItem[]): T {
  const parentId = parentFor(ink, items);
  if (parentId === ink.parentId) return ink;
  const { parentId: _, ...rest } = ink;
  return (parentId ? { ...rest, parentId } : rest) as T;
}

/** The ids plus everything written inside the boxes among them. */
export function withChildren(ids: string[], items: NoteItem[]) {
  const set = new Set(ids);
  for (const i of items) if (i.parentId && set.has(i.parentId)) set.add(i.id);
  return [...set];
}

/** What goes when these are deleted: also the writing in the boxes and the arrows on them. */
export function withDependents(ids: string[], items: NoteItem[]) {
  const all = withChildren(ids, items);
  return [...new Set([...all, ...attachedTo(items, new Set(all)).map((c) => c.id)])];
}

/**
 * What a stroke drawn with the diagram tool means. Closed shapes on the paper become boxes; a
 * line from a box to another becomes an arrow between them, and to empty paper, an arrow to a
 * new box there. Anything else (writing, mostly inside a box or not) stays ink.
 */
export type Sketch =
  | { kind: 'box'; shape: NodeShape; x: number; y: number; w: number; h: number }
  | { kind: 'link'; from: NodeItem; to: NodeItem }
  | { kind: 'branch'; from: NodeItem; at: Vec }
  | null;

/** Smallest hand-drawn shape taken as a box (smaller ones are letters), in points. */
const MIN_SKETCH_BOX = 36;
/** How far outside a box a line may start or end and still be on it, in points. */
const NEAR_BOX = 16;
/** Shortest line out of a box that makes a new box at its end, in points. */
const MIN_BRANCH = 50;

const nearNode = (nodes: NodeItem[], [x, y]: Vec) =>
  nodes.find((n) => pointInNode(n, [x, y])) ?? nodes.find((n) => x > n.x - NEAR_BOX && x < n.x + n.w + NEAR_BOX && y > n.y - NEAR_BOX && y < n.y + n.h + NEAR_BOX);

export function readSketch(points: Vec[], items: NoteItem[], preferred: NodeShape): Sketch {
  if (points.length < 2) return null;
  const length = points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);
  if (length < 20) return null;
  const nodes = items.filter(isNode).sort((a, b) => b.z - a.z);
  const start = points[0];
  // The far end of a line, even with an arrow head drawn at its tip in the same stroke.
  const tip = points.reduce((far, p) => (Math.hypot(p[0] - start[0], p[1] - start[1]) > Math.hypot(far[0] - start[0], far[1] - start[1]) ? p : far), start);
  const chord = Math.hypot(tip[0] - start[0], tip[1] - start[1]);
  const open = chord >= 0.6 * length;
  const from = nearNode(nodes, start);

  if (from) {
    const outline = nodeOutline(from);
    if (points.filter((p) => pointInPolygon(p, outline)).length >= points.length * 0.6) return null; // writing in the box
    if (!open) return null;
    const to = nearNode(nodes.filter((n) => n.id !== from.id), tip);
    if (to) return { kind: 'link', from, to };
    // A straight-ish line out to empty paper: a new box at its end.
    const dev = Math.max(...points.map(([x, y]) => Math.abs((tip[0] - start[0]) * (start[1] - y) - (start[0] - x) * (tip[1] - start[1])) / chord));
    if (chord >= MIN_BRANCH && dev < 0.2 * chord && !pointInNode(from, tip)) return { kind: 'branch', from, at: tip };
    return null;
  }

  const fit = closedFit(points);
  if (!fit) return null;
  const w = fit.x2 - fit.x1;
  const h = fit.y2 - fit.y1;
  if (w < MIN_SKETCH_BOX || h < MIN_SKETCH_BOX) return null;
  const kinds = ['rect', 'ellipse', 'diamond'] as const;
  const best = kinds.reduce((a, b) => (fit.errors[b] < fit.errors[a] ? b : a));
  if (fit.errors[best] > 0.08) return null;
  const shape: NodeShape = best === 'rect' ? (preferred === 'rect' ? 'rect' : 'round') : best;
  return { kind: 'box', shape, x: fit.x1, y: fit.y1, w, h };
}

/** Room between boxes laid out by `layoutTree`, in points: between levels, and between siblings. */
const LEVEL_GAP = 70;
const SIBLING_GAP = 26;

/**
 * Tidies the boxes reached from `rootId` by following arrows (from → to) into a tree: each box's
 * children in a row beside it, siblings evenly spaced, the root where it is. Sideways (a mind
 * map, branches on both sides as they were) unless the children are mostly below or above it
 * (a flowchart, top to bottom). Returns where each moved box's top-left corner goes.
 */
export function layoutTree(rootId: string, items: NoteItem[]): Map<string, Vec> {
  const nodes = new Map(items.filter(isNode).map((n) => [n.id, n]));
  const root = nodes.get(rootId);
  const out = new Map<string, Vec>();
  if (!root) return out;
  const arrows = items.filter(isConnector);
  // Each box's children, the first time it's reached (a box reached twice keeps its first parent).
  const kids = new Map<string, NodeItem[]>();
  const seen = new Set([rootId]);
  for (let queue = [root]; queue.length; ) {
    const n = queue.shift()!;
    const next = arrows.filter((c) => c.from.node === n.id && c.to.node && !seen.has(c.to.node)).map((c) => nodes.get(c.to.node!)!).filter(Boolean);
    next.forEach((c) => seen.add(c.id));
    kids.set(n.id, next);
    queue.push(...next);
  }
  const first = kids.get(rootId)!;
  if (!first.length) return out;

  const center = (n: NodeItem): Vec => [n.x + n.w / 2, n.y + n.h / 2];
  const [rx, ry] = center(root);
  const sideways = first.filter((c) => Math.abs(center(c)[0] - rx) >= Math.abs(center(c)[1] - ry)).length * 2 >= first.length;
  // Along: the direction levels go; across: the one siblings are spread on.
  const size = (n: NodeItem) => (sideways ? { along: n.w, across: n.h } : { along: n.h, across: n.w });
  const across = (n: NodeItem) => (sideways ? center(n)[1] : center(n)[0]);
  const extent = (n: NodeItem): number => {
    const k = kids.get(n.id) ?? [];
    return Math.max(size(n).across, k.reduce((sum, c) => sum + extent(c), 0) + SIBLING_GAP * Math.max(0, k.length - 1));
  };
  /** Lays out n's children on side `dir` (+1 / -1), n's near edge at `edge` and its middle at `mid`. */
  const placeKids = (group: NodeItem[], edge: number, mid: number, dir: 1 | -1) => {
    const sorted = [...group].sort((a, b) => across(a) - across(b));
    const total = sorted.reduce((sum, c) => sum + extent(c), 0) + SIBLING_GAP * Math.max(0, sorted.length - 1);
    let at = mid - total / 2;
    for (const c of sorted) {
      const e = extent(c);
      const near = edge + dir * LEVEL_GAP;
      const along = dir > 0 ? near : near - size(c).along;
      const cMid = at + e / 2;
      const acrossStart = cMid - size(c).across / 2;
      out.set(c.id, sideways ? [along, acrossStart] : [acrossStart, along]);
      placeKids(kids.get(c.id) ?? [], dir > 0 ? along + size(c).along : along, cMid, dir);
      at += e + SIBLING_GAP;
    }
  };
  const rootAlong = sideways ? root.x : root.y;
  const rootMid = sideways ? ry : rx;
  const before = first.filter((c) => (sideways ? center(c)[0] < rx : center(c)[1] < ry));
  placeKids(first.filter((c) => !before.includes(c)), rootAlong + size(root).along, rootMid, 1);
  placeKids(before, rootAlong, rootMid, -1);
  return out;
}

/** Alignment guides while moving boxes: lines where an edge or center lines up with another box's. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

/**
 * Nudges a move (dx, dy) of `moving` boxes so their edges or centers line up with `others`'
 * when within `tolerance`, and says along which lines.
 */
export function snapMove(moving: NodeItem[], others: NodeItem[], dx: number, dy: number, tolerance: number) {
  const box = unionBox(moving);
  const guides: Guide[] = [];
  if (!box || !others.length) return { dx, dy, guides };
  const lines = (x: number, w: number) => [x, x + w / 2, x + w];
  const snap = (mine: number[], theirs: number[], axis: Guide['axis']) => {
    let best: { shift: number; at: number } | null = null;
    for (const a of mine) for (const b of theirs) if (Math.abs(b - a) <= tolerance && (!best || Math.abs(b - a) < Math.abs(best.shift))) best = { shift: b - a, at: b };
    if (best) guides.push({ axis, at: best.at });
    return best?.shift ?? 0;
  };
  const ndx = dx + snap(lines(box.x + dx, box.w), others.flatMap((n) => lines(n.x, n.w)), 'x');
  const ndy = dy + snap(lines(box.y + dy, box.h), others.flatMap((n) => lines(n.y, n.h)), 'y');
  return { dx: ndx, dy: ndy, guides };
}
