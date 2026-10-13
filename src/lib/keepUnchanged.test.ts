import { describe, expect, it } from 'vitest';
import type { StrokeItem, TextItem } from '../db/schema';
import { keepUnchanged, sameItem } from './keepUnchanged';

describe('keepUnchanged', () => {
  const stroke: StrokeItem = { id: 's', notebookId: 'n', pageId: 'p', z: 1, createdAt: 0, type: 'stroke', tool: 'pen', color: '#000', width: 2, points: [[0, 0, 0.5], [10, 5, 0.6]] };
  const text: TextItem = { id: 't', notebookId: 'n', pageId: 'p', z: 2, createdAt: 0, type: 'text', x: 5, y: 5, w: 100, text: 'oi', fontSize: 16, color: '#000' };
  const copy = <T,>(i: T): T => structuredClone(i);

  it('keeps the object on screen for a database copy of the same item', () => {
    const known = new Map<string, StrokeItem | TextItem>([[stroke.id, stroke], [text.id, text]]);
    const [s, t] = keepUnchanged(known, [copy(stroke), copy(text)]);
    expect(s).toBe(stroke);
    expect(t).toBe(text);
  });

  it('takes the new version of what changed, and new items as they come', () => {
    const known = new Map<string, StrokeItem | TextItem>([[stroke.id, stroke], [text.id, text]]);
    const moved = { ...copy(stroke), points: [[1, 0, 0.5], [10, 5, 0.6]] } as StrokeItem;
    const edited = { ...copy(text), text: 'olá' };
    const fresh = { ...copy(stroke), id: 'new' };
    const out = keepUnchanged(known, [moved, edited, fresh]);
    expect(out[0]).toBe(moved);
    expect(out[1]).toBe(edited);
    expect(out[2]).toBe(fresh);
  });

  it('tells apart items that differ only in a nested field or an extra key', () => {
    expect(sameItem(stroke, { ...copy(stroke), points: [[0, 0, 0.5], [10, 5, 0.7]] })).toBe(false);
    expect(sameItem(stroke, { ...copy(stroke), parentId: 'box' })).toBe(false);
    expect(sameItem(text, copy(text))).toBe(true);
  });
});
