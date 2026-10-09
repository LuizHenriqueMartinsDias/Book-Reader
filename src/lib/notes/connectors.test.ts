import { describe, expect, it } from 'vitest';
import type { ConnectorItem, NodeItem } from '../../db/schema';
import { attachedTo, connectorHit, connectorPoints, heads, midpoint, nodesById, settle } from './connectors';

const base = { notebookId: 'n', pageId: 'p', createdAt: 0, z: 1 };
const box = (id: string, x: number, y: number, shape: NodeItem['shape'] = 'rect'): NodeItem => ({
  ...base,
  id,
  type: 'node',
  shape,
  x,
  y,
  w: 100,
  h: 50,
  color: '#000',
  filled: false,
  width: 2,
  text: '',
  fontSize: 16,
});
const arrow = (route: ConnectorItem['route'], to: ConnectorItem['to'] = { node: 'b', x: 0, y: 0 }): ConnectorItem => ({
  ...base,
  id: 'c',
  type: 'connector',
  from: { node: 'a', x: 0, y: 0 },
  to,
  route,
  arrows: 'end',
  color: '#000',
  width: 2,
  label: '',
  fontSize: 14,
});

describe('diagram arrows', () => {
  const nodes = nodesById([box('a', 0, 0), box('b', 300, 200), box('d', 300, 0, 'diamond')]);

  it('runs straight between the edges of the boxes', () => {
    const [from, to] = connectorPoints(arrow('straight'), nodes);
    expect(from[0]).toBeGreaterThan(50); // left box A through its edge, not its center
    expect(from[1]).toBeCloseTo(50, 0); // A's bottom edge (the line is steep)
    expect(to[1]).toBeCloseTo(200, 0); // B's top edge
  });

  it('meets a diamond at its slanted edge', () => {
    const [, to] = connectorPoints(arrow('straight', { node: 'd', x: 0, y: 0 }), nodes);
    expect(to[0]).toBeCloseTo(300, 0); // the diamond's left corner, level with A's center
    expect(to[1]).toBeCloseTo(25, 0);
  });

  // B further down than across: out of A's bottom, into B's top.
  const below = nodesById([box('a', 0, 0), box('b', 150, 300)]);

  it('turns at right angles out of the facing sides', () => {
    const pts = connectorPoints(arrow('elbow'), below);
    expect(pts[0]).toEqual([50, 50]);
    expect(pts[pts.length - 1]).toEqual([200, 300]);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1]).toBe(true);
  });

  it('curves smoothly between the same sides', () => {
    const pts = connectorPoints(arrow('curve'), below);
    expect(pts[0]).toEqual([50, 50]);
    expect(pts[pts.length - 1]).toEqual([200, 300]);
    expect(connectorPoints(arrow('elbow'), nodes)[0]).toEqual([100, 25]); // B more across than down: A's right side
    expect(pts.length).toBeGreaterThan(10);
  });

  it('follows a box that moves, and has loose ends where they were left', () => {
    const moved = nodesById([box('a', 0, 0), box('b', 300, 0)]);
    expect(connectorPoints(arrow('elbow'), moved)).toEqual([
      [100, 25],
      [300, 25],
    ]);
    const loose = connectorPoints(arrow('straight', { x: 500, y: 25 }), moved);
    expect(loose[1]).toEqual([500, 25]);
  });

  it('puts heads on the right ends, its text halfway, and can be hit', () => {
    const pts = connectorPoints(arrow('straight', { x: 400, y: 25 }), nodes);
    expect(heads({ arrows: 'end' }, pts)).toHaveLength(1);
    expect(heads({ arrows: 'both' }, pts)).toHaveLength(2);
    expect(heads({ arrows: 'none' }, pts)).toHaveLength(0);
    expect(midpoint([[0, 0], [10, 0], [10, 10]])).toEqual([10, 0]);
    expect(connectorHit(arrow('straight', { x: 400, y: 25 }), nodes, 250, 25, 4)).toBe(true);
    expect(connectorHit(arrow('straight', { x: 400, y: 25 }), nodes, 250, 60, 4)).toBe(false);
  });

  it('finds the arrows on some boxes and records where their ends are', () => {
    const c = arrow('straight');
    expect(attachedTo([c], new Set(['b']))).toHaveLength(1);
    expect(attachedTo([c], new Set(['x']))).toHaveLength(0);
    const s = settle(c, nodes);
    expect([s.from.x, s.to.y]).toEqual([connectorPoints(c, nodes)[0][0], 200]);
    expect(settle(s, nodes)).toBe(s);
  });
});
