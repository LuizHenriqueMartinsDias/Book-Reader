import type { Point } from '../../db/schema';
import { useUi } from '../../store/ui';

/**
 * Clears a canvas that shows ink being written and draws on it with `paint`.
 *
 * Not a low-latency (`desynchronized`) canvas: these live canvases are see-through layers over
 * the page, and on Android such a canvas loses its transparency and turns the whole page black.
 */
export function repaintLive(canvas: HTMLCanvasElement, paint: (ctx: CanvasRenderingContext2D) => void) {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  paint(ctx);
  ctx.restore();
}

/**
 * Where the pen is about to be, as the browser predicts it from its motion: drawn at the end of
 * the stroke in progress so it keeps up with the pen tip, never saved.
 */
export function predictedPoints(e: PointerEvent, toPoint: (ev: PointerEvent) => Point): Point[] {
  if (!useUi.getState().lowLatencyInk) return [];
  return (e.getPredictedEvents?.() ?? []).map(toPoint);
}
