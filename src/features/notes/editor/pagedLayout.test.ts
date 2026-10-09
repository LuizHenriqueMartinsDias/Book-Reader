import { describe, expect, it } from 'vitest';
import { anchorAt, buildLayout, scrollFor, turnedSize } from './pagedLayout';

const pages = [
  { width: 595, height: 842 },
  { width: 595, height: 842 },
  { width: 842, height: 595 }, // a landscape page from an imported PDF
];

describe('paged layout anchors', () => {
  it('keeps the spot under the fingers in place when zooming', () => {
    const before = buildLayout(pages, 1.3);
    const a = anchorAt(before, 40, 1500, 300, 200);
    expect(a.index).toBe(1);
    const after = buildLayout(pages, 2.6);
    const { left, top } = scrollFor(after, a);
    // Same spot, re-measured in the zoomed layout, is still at screen (300, 200).
    const again = anchorAt(after, left, top, 300, 200);
    expect(again.index).toBe(a.index);
    expect(again.fx).toBeCloseTo(a.fx, 9);
    expect(again.fy).toBeCloseTo(a.fy, 9);
  });

  it('accounts for narrower pages being centered', () => {
    const l = buildLayout(pages, 1);
    // Page 3 (landscape) is the widest; portrait pages sit centered with a margin.
    const a = anchorAt(l, 0, l.offsets[0] + 10, 16 + (842 - 595) / 2, 0);
    expect(a.index).toBe(0);
    expect(a.fx).toBeCloseTo(0, 9);
  });
});

describe('turnedSize', () => {
  it('swaps width and height on a quarter turn and grows on a slant', () => {
    expect(turnedSize({ width: 595, height: 842 }, 90)).toEqual({ width: 842, height: 595 });
    expect(turnedSize({ width: 595, height: 842 }, 180)).toEqual({ width: 595, height: 842 });
    const slant = turnedSize({ width: 100, height: 100 }, 45);
    expect(slant.width).toBeCloseTo(141.421, 2);
  });
});
