import { describe, expect, it } from 'vitest';
import type { NodeItem, NoteItem, StrokeItem, TextItem } from '../../db/schema';
import { bboxOf, changedArea, eraserHits, itemsInLasso, pointInPolygon, transformItems, type Vec } from './geometry';

const base = { notebookId: 'n', pageId: 'p', z: 1, createdAt: 0 };
const stroke = (id: string, pts: [number, number][]): StrokeItem => ({ ...base, id, type: 'stroke', tool: 'pen', color: '#000', width: 2, points: pts.map(([x, y]) => [x, y, 0.5]) });
const text: TextItem = { ...base, id: 't', type: 'text', x: 200, y: 200, w: 100, h: 40, text: 'oi', fontSize: 16, color: '#000' };
const square: Vec[] = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe('lasso', () => {
  it('tests points against a polygon', () => {
    expect(pointInPolygon([50, 50], square)).toBe(true);
    expect(pointInPolygon([150, 50], square)).toBe(false);
  });

  it('selects strokes mostly inside and other items by their center', () => {
    const inside = stroke('in', [[10, 10], [50, 50], [90, 20]]);
    const straddling = stroke('half', [[90, 50], [120, 50], [150, 50], [180, 50]]);
    const items: NoteItem[] = [inside, straddling, text];
    expect(itemsInLasso(items, square).map((i) => i.id)).toEqual(['in']);
    expect(itemsInLasso(items, [[150, 150], [400, 150], [400, 400], [150, 400]]).map((i) => i.id)).toEqual(['t']);
  });
});

describe('transformItems', () => {
  it('moves and scales geometry, stroke widths and font sizes around the origin', () => {
    const [s, t] = transformItems([stroke('s', [[10, 10], [20, 20]]), text], { dx: 5, dy: -5, scale: 2, origin: [10, 10] });
    expect((s as StrokeItem).points.map((p) => p.slice(0, 2))).toEqual([[15, 5], [35, 25]]);
    expect((s as StrokeItem).width).toBe(4);
    expect(t).toMatchObject({ x: 395, y: 385, w: 200, h: 80, fontSize: 32 });
  });
});

describe('bbox and eraser', () => {
  it('pads strokes by half their width', () => {
    expect(bboxOf(stroke('s', [[10, 10], [30, 20]]))).toEqual({ x: 9, y: 9, w: 22, h: 12 });
  });

  it('erases ink but not text', () => {
    const items: NoteItem[] = [stroke('s', [[0, 0], [100, 0]]), text];
    expect(eraserHits(items, 50, 3, 2).map((i) => i.id)).toEqual(['s']);
    expect(eraserHits(items, 250, 220, 5)).toEqual([]);
  });

  it('reaches ink at the edge of its box, counting the eraser and the ink width', () => {
    // A diagonal stroke: inside its box but away from the line misses; next to the line hits.
    const diagonal = stroke('d', [[0, 0], [100, 100]]);
    expect(eraserHits([diagonal], 90, 10, 5)).toEqual([]);
    expect(eraserHits([diagonal], 50, 56, 5).map((i) => i.id)).toEqual(['d']);
    // Just past the end, by less than the eraser plus half the ink.
    expect(eraserHits([diagonal], 104, 104, 5).map((i) => i.id)).toEqual(['d']);
    expect(eraserHits([diagonal], 110, 110, 5)).toEqual([]);
  });
});

describe('rotated views', () => {
  it('maps screen points into a rotated element', async () => {
    const { screenToLocal, rotateVec, snapQuarter } = await import('./geometry');
    // 200×100 box rotated 90° clockwise around its center at (500, 500): its top-left corner
    // is now at the top-right of the rotated box on screen.
    const local = screenToLocal([550, 400], [500, 500], 90, 200, 100);
    expect(local[0]).toBeCloseTo(0, 9);
    expect(local[1]).toBeCloseTo(0, 9);
    const center = screenToLocal([500, 500], [500, 500], 33, 200, 100);
    expect(center).toEqual([100, 50]);
    const v = rotateVec([1, 0], 90);
    expect(v[0]).toBeCloseTo(0, 9);
    expect(v[1]).toBeCloseTo(1, 9);
    expect(snapQuarter(87)).toBe(90);
    expect(snapQuarter(-3)).toBe(0);
    expect(snapQuarter(30)).toBe(30);
    expect(snapQuarter(270)).toBe(-90);
  });
});

describe('changedArea', () => {
  const a = stroke('a', [[0, 0], [100, 0]]);
  const far = stroke('far', [[500, 400], [600, 400]]);

  it('covers what was added or removed, not the rest of the page', () => {
    const added = stroke('b', [[10, 50], [40, 50]]);
    const area = changedArea([a, far], [a, far, added])!;
    expect(area.x).toBeLessThanOrEqual(9);
    expect(area.x + area.w).toBeGreaterThanOrEqual(41);
    expect(area.y + area.h).toBeLessThan(400);
    // A stroke replaced by its pieces: the area of both.
    const piece = stroke('p', [[0, 0], [40, 0]]);
    expect(changedArea([a, far], [piece, far])!.x + changedArea([a, far], [piece, far])!.w).toBeGreaterThanOrEqual(101);
  });

  it('is null when the same objects are shown, whatever their order', () => {
    expect(changedArea([a, far], [far, a])).toBeNull();
  });

  it('asks for the whole page when more than plain ink changed', () => {
    const box = { ...base, id: 'box', type: 'node', shape: 'rect', x: 0, y: 0, w: 50, h: 30, color: '#000', width: 2, text: '' } as NodeItem;
    expect(changedArea([a], [a, box])).toBeUndefined();
    expect(changedArea([a], [a, text])).toBeUndefined();
  });
});
