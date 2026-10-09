import { describe, expect, it } from 'vitest';
import type { NodeItem, StickyItem, StrokeItem } from '../../db/schema';
import { parentFor } from './diagram';
import { layered } from './export';
import { bboxOf, transformItems } from './geometry';
import { STICKY_ICON } from './sticky';

const base = { notebookId: 'n', pageId: 'p', createdAt: 0 };
const sticky = (over: Partial<StickyItem> = {}): StickyItem => ({ ...base, id: 's', z: 1, type: 'sticky', x: 100, y: 100, w: 150, h: 150, color: '#fef08a', text: '', fontSize: 14, ...over });
const stroke = (id: string, pts: [number, number][], z = 5): StrokeItem => ({ ...base, id, z, type: 'stroke', tool: 'pen', color: '#000', width: 2, points: pts.map(([x, y]) => [x, y, 0.5]) });
const box: NodeItem = { ...base, id: 'b', z: 9, type: 'node', shape: 'rect', x: 0, y: 0, w: 400, h: 400, color: '#000', filled: false, width: 2, text: '', fontSize: 16 };

describe('post-its', () => {
  it('own the writing on them, even over a diagram box drawn later', () => {
    expect(parentFor(stroke('w', [[120, 150], [200, 160]]), [box, sticky()])).toBe('s');
    expect(parentFor(stroke('w', [[20, 20], [60, 30]]), [box, sticky()])).toBe('b');
    // A folded one has nothing to write on.
    expect(parentFor(stroke('w', [[120, 150], [200, 160]]), [sticky({ collapsed: true })])).toBeUndefined();
  });

  it('take up just their icon when folded, and move and resize like other items', () => {
    expect(bboxOf(sticky({ collapsed: true }))).toEqual({ x: 100, y: 100, w: STICKY_ICON, h: STICKY_ICON });
    expect(transformItems([sticky()], { dx: 10, dy: 0, scale: 2, origin: [100, 100] })[0]).toMatchObject({ x: 110, y: 100, w: 300, h: 300, fontSize: 28 });
  });

  it('lie over the page ink with their own writing on top, and fold it away', () => {
    const items = [stroke('mine', [[120, 150]], 3), { ...stroke('page', [[0, 0]], 7) }, sticky()].map((i) => (i.id === 'mine' ? { ...i, parentId: 's' } : i));
    expect(layered(items).map((i) => i.id)).toEqual(['page', 's', 'mine']);
    const folded = items.map((i) => (i.id === 's' ? { ...i, collapsed: true } : i));
    expect(layered(folded).map((i) => i.id)).toEqual(['page', 's']);
  });
});
