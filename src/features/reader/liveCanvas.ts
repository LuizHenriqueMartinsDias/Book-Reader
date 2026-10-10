import type { Point } from '../../db/schema';
import { useUi } from '../../store/ui';

interface Live {
  ctx: CanvasRenderingContext2D;
  /** Low-latency canvases only: where a repaint is drawn before it replaces what's on screen. */
  buffer?: HTMLCanvasElement;
}
const lives = new WeakMap<HTMLCanvasElement, Live>();

function live(canvas: HTMLCanvasElement): Live {
  let l = lives.get(canvas);
  if (!l) {
    // A canvas keeps the options of its first getContext call, so every call for a live canvas
    // goes through here; changing the setting applies to canvases created afterwards.
    const ctx = canvas.getContext('2d', { desynchronized: useUi.getState().lowLatencyInk })!;
    l = { ctx, buffer: ctx.getContextAttributes?.().desynchronized ? document.createElement('canvas') : undefined };
    lives.set(canvas, l);
  }
  return l;
}

/**
 * Clears a canvas that shows ink being written and draws on it with `paint`. With low-latency
 * ink (Chrome's `desynchronized` canvas) its pixels reach the screen right away instead of
 * waiting for the page's next frame. Such a canvas also shows every step as it happens, so the
 * repaint is drawn on a hidden buffer and swapped in at once, so the clearing doesn't flash.
 */
export function repaintLive(canvas: HTMLCanvasElement, paint: (ctx: CanvasRenderingContext2D) => void) {
  const { ctx, buffer } = live(canvas);
  const target = buffer ? buffer.getContext('2d')! : ctx;
  if (buffer && (buffer.width !== canvas.width || buffer.height !== canvas.height)) {
    buffer.width = canvas.width;
    buffer.height = canvas.height;
  }
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, canvas.width, canvas.height);
  target.save();
  paint(target);
  target.restore();
  if (!buffer) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(buffer, 0, 0);
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
