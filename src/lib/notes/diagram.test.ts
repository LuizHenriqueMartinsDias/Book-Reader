import { describe, expect, it } from 'vitest';
import type { ConnectorItem, NodeItem, StrokeItem } from '../../db/schema';
import { attach, layoutTree, nodeAt, nodeTextBox, parentFor, readSketch, snapMove, withChildren, withDependents } from './diagram';
import type { Vec } from './geometry';
import { bboxOf, eraserHits, transformItems } from './geometry';

const base = { notebookId: 'n', pageId: 'p', createdAt: 0 };
const box = (id: string, shape: NodeItem['shape'], x: number, y: number, z = 1): NodeItem => ({
  ...base,
  id,
  z,
  type: 'node',
  shape,
  x,
  y,
  w: 200,
  h: 100,
  color: '#000',
  filled: true,
  width: 2,
  text: '',
  fontSize: 16,
});
const stroke = (id: string, pts: [number, number][]): StrokeItem => ({
  ...base,
  id,
  z: 5,
  type: 'stroke',
  tool: 'pen',
  color: '#000',
  width: 2,
  points: pts.map(([x, y]) => [x, y, 0.5]),
});

describe('diagram boxes', () => {
  it('knows the box under a point, by its real shape', () => {
    const items = [box('r', 'rect', 0, 0), box('d', 'diamond', 300, 0)];
    expect(nodeAt(items, [10, 10])?.id).toBe('r');
    expect(nodeAt(items, [400, 50])?.id).toBe('d');
    expect(nodeAt(items, [305, 5])).toBeUndefined(); // the diamond's empty corner
  });

  it('attaches handwriting written inside a box, and lets it go when moved out', () => {
    const items = [box('a', 'rect', 0, 0, 1), box('b', 'round', 50, 20, 2)];
    const inBoth = stroke('s', [[60, 30], [120, 60]]);
    expect(parentFor(inBoth, items)).toBe('b'); // the box on top
    const attached = attach(inBoth, items);
    expect(attached.parentId).toBe('b');
    const outside = attach({ ...attached, points: attached.points.map(([x, y, p]) => [x + 1000, y, p]) }, items);
    expect(outside.parentId).toBeUndefined();
    expect(parentFor(stroke('t', [[190, 50], [400, 50]]), items)).toBeUndefined(); // mostly outside
  });

  it('brings along what is written inside a selected box', () => {
    const items = [box('a', 'rect', 0, 0), { ...stroke('s', [[10, 10]]), parentId: 'a' }, stroke('t', [[500, 500]])];
    expect(withChildren(['a'], items).sort()).toEqual(['a', 's']);
  });

  it('moves, resizes and erases boxes by their outline', () => {
    const b = box('a', 'ellipse', 0, 0);
    const [moved] = transformItems([b], { dx: 10, dy: 0, scale: 2, origin: [0, 0] }) as NodeItem[];
    expect(moved).toMatchObject({ x: 10, y: 0, w: 400, h: 200, width: 4, fontSize: 32 });
    expect(bboxOf(b)).toEqual({ x: -1, y: -1, w: 202, h: 102 });
    expect(eraserHits([b], 100, 50, 5)).toHaveLength(0); // inside: that's the handwriting's place
    expect(eraserHits([b], 200, 50, 5)).toHaveLength(1); // on the outline
  });

  it('keeps text clear of the corners of pointed and round boxes', () => {
    const t = nodeTextBox(box('d', 'diamond', 0, 0));
    expect(t.x).toBeGreaterThan(40);
    expect(t.w).toBeLessThan(120);
  });

  it('deletes a box with its writing and the arrows on it, but not other boxes', () => {
    const arrow: ConnectorItem = { ...base, id: 'c', z: 3, type: 'connector', from: { node: 'a', x: 0, y: 0 }, to: { node: 'b', x: 0, y: 0 }, route: 'straight', arrows: 'end', color: '#000', width: 2, label: '', fontSize: 14 };
    const items = [box('a', 'rect', 0, 0), box('b', 'rect', 300, 0), { ...stroke('s', [[10, 10]]), parentId: 'a' }, arrow];
    expect(withDependents(['a'], items).sort()).toEqual(['a', 'c', 's']);
    expect(withChildren(['a'], items).sort()).toEqual(['a', 's']); // moving a box leaves the arrow to follow
  });
});

describe('hand-drawn diagrams', () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const wobble = (pts: Vec[]): Vec[] => pts.map(([x, y], i) => [x + Math.sin(i * 1.7) * 1.5, y + Math.cos(i * 2.3) * 1.5]);
  const path = (...corners: Vec[]): Vec[] =>
    wobble(corners.slice(1).flatMap((b, k) => range(15).map((i): Vec => [corners[k][0] + ((b[0] - corners[k][0]) * i) / 15, corners[k][1] + ((b[1] - corners[k][1]) * i) / 15])));
  const boxes = [box('a', 'rect', 0, 0), box('b', 'rect', 400, 0)];

  it('turns a drawn rectangle, ellipse or diamond on the paper into a box', () => {
    expect(readSketch(path([0, 300], [160, 300], [160, 380], [0, 380], [0, 302]), boxes, 'round')).toMatchObject({ kind: 'box', shape: 'round' });
    expect(readSketch(path([0, 300], [160, 300], [160, 380], [0, 380], [0, 302]), boxes, 'rect')).toMatchObject({ kind: 'box', shape: 'rect' });
    const circle = wobble(range(60).map((i): Vec => [100 + 70 * Math.cos((i / 58) * 2 * Math.PI), 400 + 40 * Math.sin((i / 58) * 2 * Math.PI)]));
    expect(readSketch(circle, boxes, 'round')).toMatchObject({ kind: 'box', shape: 'ellipse' });
    expect(readSketch(path([80, 300], [160, 350], [80, 400], [0, 350], [78, 301]), boxes, 'round')).toMatchObject({ kind: 'box', shape: 'diamond' });
  });

  it('connects two boxes with a line drawn between them, arrow head or not', () => {
    expect(readSketch(path([190, 50], [410, 52]), boxes, 'round')).toMatchObject({ kind: 'link', from: { id: 'a' }, to: { id: 'b' } });
    const withHead = [...path([190, 50], [410, 52]), ...path([410, 52], [395, 40], [410, 52], [395, 64])];
    expect(readSketch(withHead, boxes, 'round')).toMatchObject({ kind: 'link', to: { id: 'b' } });
  });

  it('grows a new box from a line out of a box to empty paper', () => {
    expect(readSketch(path([100, 95], [100, 250]), boxes, 'round')).toMatchObject({ kind: 'branch', from: { id: 'a' } });
  });

  it('leaves writing alone: in a box, small letters, scribbles', () => {
    expect(readSketch(path([20, 20], [120, 30], [40, 60], [150, 70]), boxes, 'round')).toBeNull();
    const letterO = wobble(range(30).map((i): Vec => [300 + 8 * Math.cos((i / 28) * 2 * Math.PI), 300 + 10 * Math.sin((i / 28) * 2 * Math.PI)]));
    expect(readSketch(letterO, boxes, 'round')).toBeNull();
    expect(readSketch(path([300, 300], [340, 340], [300, 380], [340, 420]), boxes, 'round')).toBeNull();
  });
});

describe('tidying and lining up diagrams', () => {
  const link = (id: string, from: string, to: string): ConnectorItem => ({ ...base, id, z: 9, type: 'connector', from: { node: from, x: 0, y: 0 }, to: { node: to, x: 0, y: 0 }, route: 'straight', arrows: 'end', color: '#000', width: 2, label: '', fontSize: 14 });

  it('lays a mind map out sideways, keeping branches on the side they were', () => {
    const items = [box('r', 'ellipse', 400, 300), box('a', 'rect', 700, 100), box('b', 'rect', 650, 500), box('c', 'rect', 50, 320), box('a1', 'rect', 900, 50), link('1', 'r', 'a'), link('2', 'r', 'b'), link('3', 'r', 'c'), link('4', 'a', 'a1')];
    const pos = layoutTree('r', items);
    expect(pos.has('r')).toBe(false); // the root stays
    const [ax, ay] = pos.get('a')!;
    const [bx, by] = pos.get('b')!;
    expect(ax).toBe(400 + 200 + 70); // right of the root, one level away
    expect(bx).toBe(ax); // siblings line up
    expect(by - ay).toBeGreaterThanOrEqual(100 + 26); // a's subtree (a and a1) is no taller than a; then the gap
    expect(pos.get('c')![0]).toBe(400 - 70 - 200); // the left branch stays on the left
    expect(pos.get('a1')![0]).toBe(ax + 200 + 70);
  });

  it('lays a flowchart out top to bottom when the steps are below', () => {
    const items = [box('s', 'rect', 300, 0), box('t', 'rect', 280, 250), box('u', 'rect', 330, 260), link('1', 's', 't'), link('2', 's', 'u')];
    const pos = layoutTree('s', items);
    expect(pos.get('t')![1]).toBe(0 + 100 + 70);
    expect(pos.get('u')![1]).toBe(pos.get('t')![1]);
    expect(pos.get('u')![0] - pos.get('t')![0]).toBe(200 + 26);
  });

  it('lines up edges and centers with other boxes when close', () => {
    const moving = [box('m', 'rect', 0, 0)];
    const other = [box('o', 'rect', 500, 304)];
    const r = snapMove(moving, other, 0, 300, 6); // top would be at 300, the other's top is at 304
    expect(r.dy).toBe(304);
    expect(r.guides).toEqual([{ axis: 'y', at: 304 }]);
    expect(snapMove(moving, other, 0, 150, 6)).toEqual({ dx: 0, dy: 150, guides: [] });
  });
});
