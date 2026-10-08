import { describe, expect, it } from 'vitest';
import { buildSpreads, resolveDouble, spreadIndexOf } from './spreads';

describe('buildSpreads', () => {
  it('puts the cover alone on the right, then pairs', () => {
    expect(buildSpreads(5, true)).toEqual([{ right: 1 }, { left: 2, right: 3 }, { left: 4, right: 5 }]);
    expect(buildSpreads(4, true)).toEqual([{ right: 1 }, { left: 2, right: 3 }, { left: 4 }]);
  });

  it('has one page per spread in single mode', () => {
    expect(buildSpreads(3, false)).toEqual([{ right: 1 }, { right: 2 }, { right: 3 }]);
  });

  it('finds the spread of any page', () => {
    const spreads = buildSpreads(9, true);
    for (let p = 1; p <= 9; p++) {
      const s = spreads[spreadIndexOf(p, true)];
      expect([s.left, s.right]).toContain(p);
    }
    expect(spreadIndexOf(4, false)).toBe(3);
  });
});

describe('resolveDouble', () => {
  const page = { width: 432, height: 648 };
  it('uses two pages on wide screens and one on portrait ones', () => {
    expect(resolveDouble('auto', 1280, 800, page)).toBe(true);
    expect(resolveDouble('auto', 390, 760, page)).toBe(false);
    expect(resolveDouble('single', 1280, 800, page)).toBe(false);
    expect(resolveDouble('double', 390, 760, page)).toBe(true);
  });
});
