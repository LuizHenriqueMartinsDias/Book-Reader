import { describe, expect, it } from 'vitest';
import { applyMatrix, computeCurl, constrainPoint, curlLeft, type Vec } from './curl';

const W = 400;
const H = 600;
const close = (a: Vec, b: Vec) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('computeCurl (right-hand leaf, spine at x = 0)', () => {
  const corner: Vec = [W, H];
  const curl = computeCurl(corner, [250, 520], W, H);

  it('lands the back of the grabbed corner on the drag point', () => {
    // The corner of the leaf is the back page's bottom-left corner (0, H).
    close(applyMatrix(curl.backMatrix, [0, H]), curl.point);
    close(curl.point, [250, 520]);
  });

  it('keeps the back page right-reading (a rotation, not a mirror)', () => {
    const [a, b, c, d] = curl.backMatrix;
    expect(a * d - b * c).toBeCloseTo(1, 6);
  });

  it('splits the leaf into front and exposed parts along the fold', () => {
    const area = (p: Vec[]) => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;
    expect(area(curl.front) + area(curl.exposed)).toBeCloseTo(W * H, 3);
    expect(curl.exposed.some(([x, y]) => x === W && y === H)).toBe(true);
  });

  it('maps the back clip onto the visible flap', () => {
    curl.backClip.forEach((v, i) => close(applyMatrix(curl.backMatrix, v), curl.flap[i]));
  });

  it('is flat when the corner has not moved', () => {
    expect(computeCurl(corner, corner, W, H).progress).toBe(0);
  });

  it('ends exactly mirrored onto the left when fully turned', () => {
    const done = computeCurl(corner, [-W, H], W, H);
    expect(done.progress).toBeCloseTo(1, 6);
    close(applyMatrix(done.backMatrix, [0, 0]), [-W, 0]);
    close(applyMatrix(done.backMatrix, [W, H]), [0, H]);
  });
});

describe('constrainPoint', () => {
  it('keeps the leaf attached to the spine', () => {
    const diag = Math.hypot(W, H);
    for (const target of [[100, 1000], [-900, 650], [-200, -300]] as Vec[]) {
      const p = constrainPoint([W, H], target, H);
      expect(Math.hypot(p[0], p[1] - H)).toBeLessThanOrEqual(W + 1e-9);
      expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(diag + 1e-9);
    }
    // Pulled straight out past the edge, it stops at the page width from the bottom spine corner.
    const q = constrainPoint([W, H], [W + 300, H], H);
    close(q, [W, H]);
    const r = constrainPoint([W, H], [-900, H], H);
    close(r, [-W, H]);
  });
});

describe('curlLeft (spine at x = w)', () => {
  it('mirrors the right-hand geometry', () => {
    const curl = curlLeft([0, H], [150, 520], W, H);
    close(applyMatrix(curl.backMatrix, [W, H]), curl.point);
    const [a, b, c, d] = curl.backMatrix;
    expect(a * d - b * c).toBeCloseTo(1, 6);
    curl.backClip.forEach((v, i) => close(applyMatrix(curl.backMatrix, v), curl.flap[i]));
  });
});
