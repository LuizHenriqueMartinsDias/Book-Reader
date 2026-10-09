import { describe, expect, it } from 'vitest';
import { appliedTurn, classify, initialTwoFinger, rotates, zooms, type TwoFingerState } from './twoFinger';

/** Feeds a gesture as (ratio, turn) samples and returns the final state. */
const run = (samples: [number, number][], canRotate = true) =>
  samples.reduce<TwoFingerState>((s, [r, t]) => classify(s, r, t, canRotate), initialTwoFinger());

const steps = (n: number, f: (k: number) => [number, number]) => Array.from({ length: n }, (_, i) => f((i + 1) / n));

describe('two-finger gestures', () => {
  it('rotates a hand twist even though the fingers also spread a little', () => {
    // 40° twist; the distance grows 10% early on, as fingers do.
    const s = run(steps(12, (k) => [1 + 0.1 * Math.min(1, k * 3), 40 * k]));
    expect(rotates(s)).toBe(true);
    expect(zooms(s)).toBe(false);
  });

  it('zooms a pinch that wobbles a few degrees, without rotating', () => {
    const s = run(steps(12, (k) => [1 + 1.2 * k, 6 * Math.sin(k * 3)]));
    expect(zooms(s)).toBe(true);
    expect(rotates(s)).toBe(false);
  });

  it('adds rotation to a zoom that keeps twisting, without a jump', () => {
    let s = run(steps(6, (k) => [1 + 0.5 * k, 2 * k]));
    expect(s.mode).toBe('zoom');
    s = classify(s, 1.6, 26);
    expect(s.mode).toBe('both');
    expect(appliedTurn(s, 26)).toBe(0);
    expect(appliedTurn(s, 40)).toBe(14);
  });

  it('adds zoom to a rotation when the fingers spread a lot', () => {
    let s = run(steps(6, (k) => [1, 30 * k]));
    expect(s.mode).toBe('rotate');
    s = classify(s, 1.5, 35);
    expect(s.mode).toBe('both');
  });

  it('never rotates where rotation is not available (fingers off any page)', () => {
    const s = run(steps(12, (k) => [1, 60 * k]), false);
    expect(rotates(s)).toBe(false);
  });
});
