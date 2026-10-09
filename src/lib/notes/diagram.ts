import type { NodeItem, NodeShape, NoteItem } from '../../db/schema';
import { nodeOutline, pointInPolygon, type Box, type Vec } from './geometry';

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

/** The box a stroke or shape was written in (most of it inside; the topmost box wins), if any. */
export function parentFor(ink: NoteItem, items: NoteItem[]): string | undefined {
  const pts = inkPoints(ink);
  if (!pts?.length) return undefined;
  const nodes = items.filter((i): i is NodeItem => isNode(i) && i.id !== ink.id).sort((a, b) => b.z - a.z);
  return nodes.find((n) => {
    const outline = nodeOutline(n);
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
