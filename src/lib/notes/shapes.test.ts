import { describe, expect, it } from 'vitest';
import { recognizeShape } from './shapes';

type P = [number, number];
const jitter = (pts: P[], amount: number): P[] => pts.map(([x, y], i) => [x + Math.sin(i * 1.7) * amount, y + Math.cos(i * 2.3) * amount]);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('recognizeShape', () => {
  it('straightens a wobbly line and snaps it when nearly horizontal', () => {
    const line = jitter(range(40).map((i): P => [i * 5, 100 + i * 0.3]), 1.5);
    const r = recognizeShape(line)!;
    expect(r.shape).toBe('line');
    expect(r.y2).toBeCloseTo(r.y1, 5);
  });

  it('recognizes a hand-drawn circle as an ellipse', () => {
    const circle = jitter(range(60).map((i): P => [100 + 50 * Math.cos((i / 58) * 2 * Math.PI), 100 + 50 * Math.sin((i / 58) * 2 * Math.PI)]), 2);
    expect(recognizeShape(circle)).toMatchObject({ shape: 'ellipse' });
  });

  it('recognizes a hand-drawn box as a rectangle', () => {
    const side = (a: P, b: P) => range(15).map((i): P => [a[0] + ((b[0] - a[0]) * i) / 15, a[1] + ((b[1] - a[1]) * i) / 15]);
    const box = jitter([...side([0, 0], [120, 0]), ...side([120, 0], [120, 80]), ...side([120, 80], [0, 80]), ...side([0, 80], [0, 3])], 1.5);
    const r = recognizeShape(box)!;
    expect(r.shape).toBe('rect');
    expect(r.x2 - r.x1).toBeGreaterThan(115);
  });

  it('leaves scribbles and tiny marks alone', () => {
    const scribble = range(50).map((i): P => [i * 4, (i % 2) * 40]);
    expect(recognizeShape(scribble)).toBeNull();
    expect(recognizeShape([[0, 0], [3, 3]])).toBeNull();
    const zigzagClosed = range(30).map((i): P => [50 + 40 * Math.cos(i / 4.6) + (i % 3) * 25, 50 + 40 * Math.sin(i / 4.6)]);
    expect(recognizeShape(zigzagClosed)).toBeNull();
  });
});
