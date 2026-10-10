import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex } from './color';

describe('color', () => {
  it('reads hex colors in the usual spellings', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex(' 2563eb ')).toBe('#2563eb');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('blue')).toBeNull();
  });

  it('converts between hex and hue/saturation/value both ways', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#ffffff');
    for (const hex of ['#1f2937', '#dc2626', '#2563eb', '#facc15', '#000000']) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
});
