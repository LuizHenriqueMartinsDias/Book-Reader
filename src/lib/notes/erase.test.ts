import { describe, expect, it } from 'vitest';
import type { NodeItem, NoteItem, Point, ShapeItem, StrokeItem, TextItem } from '../../db/schema';
import { cutPoints, densify, erasedArea, eraseItem } from './erase';

const base = { notebookId: 'n', pageId: 'p', z: 3, createdAt: 0 };
const line = (x1: number, x2: number): Point[] => [[x1, 0, 0.5], [x2, 0, 0.5]];
let n = 0;
const id = () => `piece${++n}`;

describe('partial eraser', () => {
  it('fills long segments with points, interpolating pressure', () => {
    const d = densify([[0, 0, 0], [10, 0, 1]], 2.5);
    expect(d).toHaveLength(5);
    expect(d[2]).toEqual([5, 0, 0.5]);
  });

  it('cuts a stroke in two where the eraser crosses it, even between its points', () => {
    const runs = cutPoints(line(0, 100), 50, 0, 10)!;
    expect(runs).toHaveLength(2);
    expect(Math.max(...runs[0].map((p) => p[0]))).toBeLessThan(40.01);
    expect(Math.min(...runs[1].map((p) => p[0]))).toBeGreaterThan(59.99);
  });

  it('leaves strokes it does not touch alone, and removes ones it covers', () => {
    expect(cutPoints(line(0, 100), 50, 30, 10)).toBeNull();
    expect(cutPoints(line(45, 55), 50, 0, 10)).toEqual([]);
  });

  it('keeps the points of the parts far from the eraser as they were', () => {
    const points: Point[] = [[0, 0, 0.5], [100, 0, 0.5], [200, 0, 0.5], [300, 0, 0.5]];
    const [left, right] = cutPoints(points, 250, 0, 10)!;
    expect(left.slice(0, 3)).toEqual(points.slice(0, 3));
    // Only the segment under the eraser was filled in.
    expect(left.length + right.length).toBeLessThan(40);
    expect(right.at(-1)).toEqual([300, 0, 0.5]);
  });

  it('turns a touched item into pieces with the same look and stacking', () => {
    const stroke: StrokeItem = { ...base, id: 's', type: 'stroke', tool: 'marker', color: '#ff0', width: 10, points: line(0, 100) };
    const pieces = eraseItem(stroke, 50, 13, 10, id)!;
    // The eraser reaches the ink's edge (width / 2), not just its centerline.
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ type: 'stroke', tool: 'marker', color: '#ff0', width: 10, z: 3, pageId: 'p' });
    expect(eraseItem(stroke, 50, 30, 10, id)).toBeNull();
  });

  it('cuts shapes as pen strokes and keeps the arrow head', () => {
    const arrow: ShapeItem = { ...base, id: 'a', type: 'shape', shape: 'arrow', x1: 0, y1: 0, x2: 200, y2: 0, color: '#000', width: 2 };
    const pieces = eraseItem(arrow, 50, 0, 5, id)!;
    expect(pieces.map((p) => p.tool)).toEqual(['pen', 'pen', 'pen']);
    expect(pieces).toHaveLength(3); // two halves of the shaft + the untouched head
  });

  it('ignores text and images', () => {
    const text: TextItem = { ...base, id: 't', type: 'text', x: 0, y: 0, w: 100, text: 'oi', fontSize: 16, color: '#000' };
    expect(eraseItem(text, 10, 10, 50, id)).toBeNull();
  });
});

describe('erasedArea', () => {
  const stroke = (id: string, x1: number, x2: number, y = 0): StrokeItem => ({ ...base, id, type: 'stroke', tool: 'pen', color: '#000', width: 2, points: [[x1, y, 0.5], [x2, y, 0.5]] });
  const a = stroke('a', 0, 100);
  const far = stroke('far', 500, 600, 400);
  const items = new Map<string, NoteItem>([a, far].map((i) => [i.id, i]));
  const none = { erasing: new Set<string>(), pieces: [] };

  it('covers the item just hidden and the pieces put in its place, not the rest of the page', () => {
    const pieces = eraseItem(a, 50, 0, 5, id)!;
    const area = erasedArea(none, { erasing: new Set(['a']), pieces }, items)!;
    expect(area.x).toBeLessThanOrEqual(-1);
    expect(area.x + area.w).toBeGreaterThanOrEqual(101);
    expect(area.y + area.h).toBeLessThan(400);
  });

  it('covers only the pieces that changed on the next move', () => {
    const first = eraseItem(a, 50, 0, 5, id)!;
    const [left, right] = first;
    const cutLeft = eraseItem(left, 20, 0, 5, id)!;
    const area = erasedArea({ erasing: new Set(['a']), pieces: first }, { erasing: new Set(['a']), pieces: [...cutLeft, right] }, items)!;
    expect(area.x + area.w).toBeLessThan(60);
  });

  it('is null when nothing changed, and undefined when more than plain ink did', () => {
    expect(erasedArea(none, none, items)).toBeNull();
    const box: NodeItem = { ...base, id: 'box', type: 'node', shape: 'rect', x: 0, y: 0, w: 50, h: 30, color: '#000', width: 2, text: '' } as NodeItem;
    expect(erasedArea(none, { erasing: new Set(['box']), pieces: [] }, new Map([['box', box]]))).toBeUndefined();
  });
});
