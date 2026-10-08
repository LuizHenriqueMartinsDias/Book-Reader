import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, type Point, type Stroke } from '../../db/schema';
import { newId } from '../../db/repo';
import { drawStroke, strokeHit } from '../../lib/ink';
import type { PageSize } from '../../lib/pdf';
import { useHistory } from '../../store/history';
import { useUi } from '../../store/ui';
import { sizeCanvas } from './canvasSize';
import { useReader } from './readerStore';

const ERASER_RADIUS_PX = 10;

interface Props {
  pageNumber: number;
  size: PageSize;
  scale: number;
}

export default function InkLayer({ pageNumber, size, scale }: Props) {
  const bookId = useReader((s) => s.bookId);
  const tool = useUi((s) => s.tool);
  const penDetected = useUi((s) => s.penDetected);
  const strokes = useLiveQuery(() => db.strokes.where({ bookId, page: pageNumber }).sortBy('createdAt'), [bookId, pageNumber]);
  const [erasing, setErasing] = useState<Set<string>>(new Set());

  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  /** `erase` also covers the eraser end of a stylus, whatever tool is selected. */
  const current = useRef<{ pointerId: number; points: Point[]; mode: 'draw' | 'erase' } | null>(null);
  const penActive = useRef(false);
  const [penHover, setPenHover] = useState(false);
  const frame = useRef(0);

  const drawing = tool === 'pen' || tool === 'marker';
  const interactive = drawing || tool === 'eraser';
  const width = size.width * scale;
  const height = size.height * scale;

  useEffect(() => {
    const canvas = committedRef.current;
    if (!canvas) return;
    const ratio = sizeCanvas(canvas, width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
    for (const s of strokes ?? []) if (!erasing.has(s.id)) drawStroke(ctx, s);
  }, [strokes, erasing, width, height, scale]);

  useEffect(() => {
    const canvas = liveRef.current;
    if (canvas) sizeCanvas(canvas, width, height);
  }, [width, height]);

  // Palm rejection on iPad: Apple Pencil arrives as touch events with touchType "stylus";
  // cancelling them stops the page from scrolling while finger touches still scroll.
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas || !interactive) return;
    const onTouch = (e: TouchEvent) => {
      const stylus = [...e.changedTouches].some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus');
      if (stylus || penActive.current || (!penDetected && e.touches.length === 1)) e.preventDefault();
    };
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onTouch);
    };
  }, [interactive, penDetected]);

  const toPoint = (e: PointerEvent | React.PointerEvent, rect: DOMRect): Point => [
    (e.clientX - rect.left) / scale,
    (e.clientY - rect.top) / scale,
    e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5,
  ];

  const eraseAt = (x: number, y: number) => {
    const radius = ERASER_RADIUS_PX / scale;
    const hits = (strokes ?? []).filter((s) => !erasing.has(s.id) && strokeHit(s.points, x, y, radius + s.width / 2));
    if (hits.length) setErasing((prev) => new Set([...prev, ...hits.map((s) => s.id)]));
  };

  const renderLive = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = liveRef.current;
      const stroke = current.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const ratio = canvas.width / width;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!stroke || stroke.mode !== 'draw' || !drawing) return;
      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
      const ui = useUi.getState();
      drawStroke(ctx, {
        tool: tool as Stroke['tool'],
        points: stroke.points,
        color: tool === 'pen' ? ui.penColor : ui.markerColor,
        width: tool === 'pen' ? ui.penWidth : ui.markerWidth,
      }, false);
    });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') {
      penActive.current = true;
      if (!penDetected) useUi.getState().set({ penDetected: true });
    } else if (e.pointerType === 'touch' && penDetected) {
      return; // finger: let it scroll
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (current.current) {
      // A second finger means a gesture (pinch/scroll), not a stroke.
      current.current = null;
      renderLive();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const p = toPoint(e, rect);
    const mode = tool === 'eraser' || (e.pointerType === 'pen' && e.buttons & 32) ? 'erase' : 'draw';
    current.current = { pointerId: e.pointerId, points: [p], mode };
    if (mode === 'erase') eraseAt(p[0], p[1]);
    renderLive();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toPoint(ev, rect);
      if (stroke.mode === 'erase') eraseAt(p[0], p[1]);
      else stroke.points.push(p);
    }
    renderLive();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (e.pointerType === 'pen') penActive.current = false;
    const stroke = current.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    current.current = null;

    if (stroke.mode === 'erase') {
      const removed = (strokes ?? []).filter((s) => erasing.has(s.id));
      if (removed.length) useHistory.getState().commit({ added: {}, removed: { strokes: removed } }).then(() => setErasing(new Set()));
      return;
    }
    if (cancelled || !drawing) return renderLive();

    const ui = useUi.getState();
    const s: Stroke = {
      id: newId(),
      bookId,
      page: pageNumber,
      tool,
      color: tool === 'pen' ? ui.penColor : ui.markerColor,
      width: tool === 'pen' ? ui.penWidth : ui.markerWidth,
      points: stroke.points,
      createdAt: Date.now(),
    };
    // Paint it onto the committed canvas right away to avoid a flicker before the DB query updates.
    const committed = committedRef.current?.getContext('2d');
    if (committed) drawStroke(committed, s);
    renderLive();
    useHistory.getState().commit({ added: { strokes: [s] }, removed: {} });
  };

  return (
    <>
      <canvas ref={committedRef} className="pointer-events-none absolute inset-0 z-20 size-full" />
      <canvas
        ref={liveRef}
        className="absolute inset-0 z-20 size-full"
        style={{
          pointerEvents: interactive ? 'auto' : 'none',
          // With a stylus around, fingers scroll; a hovering stylus switches the layer to drawing.
          touchAction: interactive && (!penDetected || penHover) ? 'none' : 'pan-x pan-y',
          cursor: tool === 'eraser' ? 'cell' : drawing ? 'crosshair' : undefined,
        }}
        onPointerOver={(e) => e.pointerType === 'pen' && setPenHover(true)}
        onPointerLeave={(e) => e.pointerType === 'pen' && !current.current && setPenHover(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      />
    </>
  );
}
