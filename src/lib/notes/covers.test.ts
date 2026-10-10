import { describe, expect, it } from 'vitest';
import { COVER_PATTERNS, coverBackground } from './covers';

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
