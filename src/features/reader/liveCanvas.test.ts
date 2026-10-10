import { afterEach, describe, expect, it } from 'vitest';
import type { Point } from '../../db/schema';
import { useUi } from '../../store/ui';
import { predictedPoints } from './liveCanvas';

const move = (x: number, predicted: number[]) =>
  ({ clientX: x, getPredictedEvents: () => predicted.map((px) => ({ clientX: px }) as PointerEvent) }) as unknown as PointerEvent;
const toPoint = (e: PointerEvent): Point => [e.clientX, 0, 0.5];

describe('predicted points', () => {
  afterEach(() => useUi.getState().set({ lowLatencyInk: true }));

  it('reaches ahead of the pen with low-latency ink', () => {
    expect(predictedPoints(move(10, [12, 14]), toPoint)).toEqual([
      [12, 0, 0.5],
      [14, 0, 0.5],
    ]);
  });

  it('stays out when low-latency ink is off or the browser has no prediction', () => {
    useUi.getState().set({ lowLatencyInk: false });
    expect(predictedPoints(move(10, [12]), toPoint)).toEqual([]);
    useUi.getState().set({ lowLatencyInk: true });
    expect(predictedPoints({ clientX: 1 } as PointerEvent, toPoint)).toEqual([]);
  });
});
