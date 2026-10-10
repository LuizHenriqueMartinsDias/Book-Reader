import { useEffect, useRef } from 'react';
import type { Note, Point } from '../../db/schema';
import { drawStroke, strokeHit } from '../../lib/ink';
import { STICKY_HEADER } from '../../lib/notes/sticky';
import { inkStyle, useUi } from '../../store/ui';
import { sizeCanvas } from './canvasSize';
import { predictedPoints, repaintLive } from './liveCanvas';

type Ink = NonNullable<Note['ink']>[number];
const ERASER_PX = 8;

/**
 * Handwriting on a book post-it, over its text: the pen, marker and eraser write and erase here
 * (also a stylus under the select tool); a finger or the mouse types in the post-it instead.
 * Strokes are in points from the post-it's top-left corner, so they move with it.
 */
export default function StickyInk({ ink, w, h, scale, onInk }: { ink: Ink[]; w: number; h: number; scale: number; onInk: (ink: Ink[]) => void }) {
  const ui = useUi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** `predicted`: where the pen is about to be, drawn ahead of the stroke but never saved. */
  const live = useRef<{ id: number; stroke: Ink | null; predicted: Point[]; erased: Set<number> } | null>(null);
  const bodyH = Math.max(1, h - STICKY_HEADER);
  const inkTool = ui.tool === 'pen' || ui.tool === 'marker' || ui.tool === 'eraser';

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Resizing clears the canvas, so only when the size changes (a low-latency canvas would show the blank).
    const size = `${w * scale}x${bodyH * scale}x${window.devicePixelRatio}`;
    if (canvas.dataset.size !== size) {
      sizeCanvas(canvas, w * scale, bodyH * scale);
      canvas.dataset.size = size;
    }
    const ratio = canvas.width / (w * scale);
    const l = live.current;
    repaintLive(canvas, (ctx) => {
      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, -STICKY_HEADER * ratio * scale);
      ink.forEach((s, i) => !l?.erased.has(i) && drawStroke(ctx, s));
      if (l?.stroke) drawStroke(ctx, l.predicted.length ? { ...l.stroke, points: [...l.stroke.points, ...l.predicted] } : l.stroke, false);
    });
  };
  useEffect(draw);

  // Before a stylus has ever been seen, this layer lets taps through to the text; a pen touching
  // the post-it is then handed over to it (and from then on it takes the pen directly).
  useEffect(() => {
    const canvas = canvasRef.current;
    const card = canvas?.closest<HTMLElement>('[data-sticky-card]');
    if (!canvas || !card) return;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'pen' || e.target === canvas || getComputedStyle(canvas).pointerEvents !== 'none') return;
      if (e.clientY < canvas.getBoundingClientRect().top) return; // the strip: dragging, not writing
      e.stopPropagation();
      e.preventDefault();
      useUi.getState().set({ penDetected: true });
      canvas.dispatchEvent(new PointerEvent('pointerdown', e));
    };
    card.addEventListener('pointerdown', down, { capture: true });
    return () => card.removeEventListener('pointerdown', down, { capture: true });
  }, []);

  const point = (e: PointerEvent | React.PointerEvent, r: DOMRect): Point => [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale + STICKY_HEADER, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5];
  const eraseAt = ([x, y]: Point) => {
    ink.forEach((s, i) => strokeHit(s.points, x, y, ERASER_PX / scale + s.width / 2) && live.current!.erased.add(i));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stylus = e.pointerType === 'pen';
    if (!inkTool && !(stylus && ui.stylusAlwaysInks)) {
      // A finger or the mouse types in the post-it (kept from the mouse events that would blur it).
      e.preventDefault();
      e.currentTarget.closest('[data-sticky-card]')?.querySelector('textarea')?.focus();
      return;
    }
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // a handed-over press may not be capturable; moves still arrive over the post-it
    }
    const erase = ui.tool === 'eraser' || (stylus && (e.buttons & 34) !== 0);
    const tool = ui.tool === 'pen' || ui.tool === 'marker' ? ui.tool : ui.lastInkTool;
    const r = e.currentTarget.getBoundingClientRect();
    live.current = { id: e.pointerId, stroke: erase ? null : { ...inkStyle(tool), points: [point(e, r)] }, predicted: [], erased: new Set() };
    if (erase) eraseAt(point(e, r));
    draw();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (l?.id !== e.pointerId) return;
    // The pen's button pressed mid-stroke: from here on it erases (what it drew getting there is dropped).
    if (l.stroke && e.pointerType === 'pen' && (e.buttons & 34) !== 0) l.stroke = null;
    const r = e.currentTarget.getBoundingClientRect();
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      if (l.stroke) l.stroke.points.push(point(ev, r));
      else eraseAt(point(ev, r));
    }
    l.predicted = l.stroke ? predictedPoints(e.nativeEvent, (ev) => point(ev, r)) : [];
    draw();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (l?.id !== e.pointerId) return;
    live.current = null;
    if (l.stroke) onInk([...ink, l.stroke]);
    else if (l.erased.size) onInk(ink.filter((_, i) => !l.erased.has(i)));
    else draw();
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full"
      // Only when something writes on it; otherwise taps reach the text under it.
      style={{ pointerEvents: inkTool || ui.penDetected ? 'auto' : 'none', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
