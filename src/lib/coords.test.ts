import { describe, expect, it } from 'vitest';
import { clientRectsToPdf, mergeLineRects, viewToUserSpace } from './coords';

describe('viewToUserSpace', () => {
  const view: [number, number, number, number] = [10, 20, 610, 820]; // 600 x 800, offset origin

  it('flips y for unrotated pages', () => {
    const f = viewToUserSpace(view, 0);
    expect(f(0, 0)).toEqual([10, 820]);
    expect(f(600, 800)).toEqual([610, 20]);
  });

  it.each([
    [90, [10, 20], [610, 820]],
    [180, [610, 20], [10, 820]],
    [270, [610, 820], [10, 20]],
    [-90, [610, 820], [10, 20]],
  ])('maps the displayed corners for rotation %i', (rotation, topLeft, bottomRight) => {
    const f = viewToUserSpace(view, rotation);
    const rotated = rotation % 180 !== 0;
    expect(f(0, 0)).toEqual(topLeft);
    expect(f(rotated ? 800 : 600, rotated ? 600 : 800)).toEqual(bottomRight);
  });
});

describe('mergeLineRects', () => {
  it('merges touching rects on the same line and keeps lines apart', () => {
    const merged = mergeLineRects([
      [10, 100, 20, 12],
      [30, 101, 40, 11],
      [10, 120, 50, 12],
    ]);
    expect(merged).toEqual([
      [10, 100, 60, 12],
      [10, 120, 50, 12],
    ]);
  });

  it('absorbs nested rects', () => {
    expect(mergeLineRects([[0, 0, 100, 10], [20, 1, 10, 8]])).toEqual([[0, 0, 100, 10]]);
  });
});

describe('clientRectsToPdf', () => {
  it('converts to page-relative units and clips to the page', () => {
    const page = new DOMRect(100, 50, 400, 600);
    const rects = [new DOMRect(120, 70, 100, 20), new DOMRect(450, 600, 100, 20), new DOMRect(0, 0, 0, 0)];
    expect(clientRectsToPdf(rects, page, 2)).toEqual([
      [10, 10, 50, 10],
      [175, 275, 25, 10],
    ]);
  });
});
