import { describe, expect, it } from 'vitest';
import { COVER_PATTERNS, coverBackground, panCover } from './covers';

describe('cover backgrounds', () => {
  it('draw every pattern over the cover color, which comes last', () => {
    for (const { id } of COVER_PATTERNS) {
      const css = coverBackground(id, '#1e3a8a');
      expect(css.endsWith(', #1e3a8a')).toBe(true);
      expect(css).not.toContain('undefined');
    }
  });

  it('differ by pattern', () => {
    const all = COVER_PATTERNS.map(({ id }) => coverBackground(id, '#000000'));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('moving a cover picture', () => {
  // A 3:4 cover of 90×120 px.
  const box: [number, number] = [90, 120];

  it('moves a wide picture sideways only, against the drag', () => {
    // 2:1 picture fills the height: 240 px wide, 150 px over.
    expect(panCover([50, 50], [-15, 40], 2, box)).toEqual([60, 50]);
    expect(panCover([50, 50], [75, 0], 2, box)).toEqual([0, 50]);
  });

  it('moves a tall picture up and down only, and stops at its edges', () => {
    // 1:2 picture fills the width: 180 px tall, 60 px over.
    expect(panCover([50, 50], [10, 30], 0.5, box)).toEqual([50, 0]);
    expect(panCover([50, 50], [0, -300], 0.5, box)).toEqual([50, 100]);
  });

  it('leaves a picture of the cover\'s own shape where it is', () => {
    expect(panCover([50, 50], [20, 20], 0.75, box)).toEqual([50, 50]);
  });
});
