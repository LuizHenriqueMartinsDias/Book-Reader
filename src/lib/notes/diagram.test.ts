import { describe, expect, it } from 'vitest';
import type { NodeItem, StrokeItem } from '../../db/schema';
import { attach, nodeAt, nodeTextBox, parentFor, withChildren } from './diagram';
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
});
