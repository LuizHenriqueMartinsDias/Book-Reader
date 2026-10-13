import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type InkTool, type Point, type Stroke } from '../../db/schema';
import { newId } from '../../db/repo';
import { drawInk, drawStroke, inkBox, strokeHit } from '../../lib/ink';
import { keepUnchanged } from '../../lib/keepUnchanged';
import { boxesOverlap, changedArea } from '../../lib/notes/geometry';
import type { PageSize } from '../../lib/pdf';
import { useHistory } from '../../store/history';
import { inkStyle, useUi } from '../../store/ui';
import { sizeCanvas } from './canvasSize';
import { predictedPoints, repaintLive } from './liveCanvas';
import { useReader } from './readerStore';

const ERASER_RADIUS_PX = 10;

/** The stylus' eraser end (32) or side button (2) is down: it erases while held. */
const penErases = (e: { pointerType: string; buttons: number }) => e.pointerType === 'pen' && (e.buttons & 34) !== 0;

interface Props {
  pageNumber: number;
  size: PageSize;
  scale: number;
}

export default function InkLayer({ pageNumber, size, scale }: Props) {
  const bookId = useReader((s) => s.bookId);
  const tool = useUi((s) => s.tool);
  const penDetected = useUi((s) => s.penDetected);
  const stylusAlwaysInks = useUi((s) => s.stylusAlwaysInks);
  // In a transaction of its own, so Dexie reads straight from the database instead of copying the
  // page's strokes again into its query cache on every read.
  const read = useLiveQuery(
    () => db.transaction('r', db.strokes, () => db.strokes.where({ bookId, page: pageNumber }).sortBy('createdAt')),
    [bookId, pageNumber],
  );
  /** The strokes on screen by id, and the one just saved from here (the next read brings a copy). */
  const known = useRef(new Map<string, Stroke>());
  const strokes = useMemo(() => {
    if (!read) return undefined;
    const kept = keepUnchanged(known.current, read);
    known.current = new Map(kept.map((s) => [s.id, s]));
    return kept;
  }, [read]);
  // Strokes being erased, hidden as the eraser goes. A ref, not state: like the pen, erasing
  // paints straight away, without making React render the page on every move.
  const erasingRef = useRef<Set<string>>(new Set());
  /** An erase was saved: the strokes stay hidden until the read without them arrives. */
  const settling = useRef(false);

  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  /**
   * `erase` also covers the stylus' eraser end and side button, whatever tool is selected.
   * `captured`: a stylus stroke started under the select tool (see the page listener below).
   * `stylus`: erasing because the pen's button is held, so letting go of it draws again.
   * `predicted`: where the pen is about to be, drawn ahead of `points` but never saved.
   */
  const current = useRef<{ pointerId: number; points: Point[]; predicted: Point[]; mode: 'draw' | 'erase'; ink: InkTool; captured: boolean; stylus: boolean; swept: Point | null } | null>(null);
  const penActive = useRef(false);
  const [penHover, setPenHover] = useState(false);
  const frame = useRef(0);

  const drawing = tool === 'pen' || tool === 'marker';
  const interactive = drawing || tool === 'eraser';
  /** Under the select tool a stylus still writes, with the last ink tool picked. */
  const stylusInks = tool === 'select' && stylusAlwaysInks;
  const width = size.width * scale;
  const height = size.height * scale;

  /** What the committed canvas shows, so a change redraws only the area it touched. */
  const drawn = useRef<{ visible: Stroke[]; view: string } | null>(null);
  const paint = () => {
    const canvas = committedRef.current;
    if (!canvas || !strokes) return;
    const erasing = erasingRef.current;
    const visible = erasing.size ? strokes.filter((s) => !erasing.has(s.id)) : strokes;
    const last = drawn.current;
    const view = `${width}|${height}|${scale}`;
    drawn.current = { visible, view };
    if (last && last.view === view) {
      // An eraser move, a stroke saved, an undo: only the area of what changed is redrawn.
      const area = changedArea(last.visible, visible, (s) => ({ box: inkBox(s), width: s.width }));
      if (area === null) return;
      if (area) {
        // The page's transform of the last full draw is still set.
        const ctx = canvas.getContext('2d')!;
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.x, area.y, area.w, area.h);
        ctx.clip();
        ctx.clearRect(area.x, area.y, area.w, area.h);
        for (const s of visible) if (boxesOverlap(inkBox(s), area)) drawInk(ctx, s);
        ctx.restore();
        return;
      }
    }
    const ratio = sizeCanvas(canvas, width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
    for (const s of visible) drawInk(ctx, s);
  };
  const paintFrame = useRef(0);
  const schedulePaint = () => {
    cancelAnimationFrame(paintFrame.current);
    paintFrame.current = requestAnimationFrame(paint);
  };
  // Before painting: once a saved erase is read back, its strokes are gone for good.
  useEffect(() => {
    if (!settling.current) return;
    settling.current = false;
    erasingRef.current = new Set();
  }, [strokes]);
  useEffect(paint, [strokes, width, height, scale]);

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
    const hits = (strokes ?? []).filter((s) => {
      if (erasingRef.current.has(s.id)) return false;
      // Most strokes are far from the eraser: their box rules them out without going through their points.
      const b = inkBox(s);
      if (x < b.x - radius || y < b.y - radius || x > b.x + b.w + radius || y > b.y + b.h + radius) return false;
      return strokeHit(s.points, x, y, radius + s.width / 2);
    });
    if (!hits.length) return;
    erasingRef.current = new Set([...erasingRef.current, ...hits.map((s) => s.id)]);
    schedulePaint();
  };

  /**
   * Erases along the way from where it last did, every half eraser: the pen reports points far
   * closer together than that, and erasing at each one falls behind on a page full of ink.
   */
  const eraseTo = (stroke: NonNullable<typeof current.current>, p: Point) => {
    if (!stroke.swept) {
      eraseAt(p[0], p[1]);
      stroke.swept = p;
      return;
    }
    const step = ERASER_RADIUS_PX / scale / 2;
    const [sx, sy] = stroke.swept;
    const n = Math.floor(Math.hypot(p[0] - sx, p[1] - sy) / step);
    for (let k = 1; k <= n; k++) eraseAt(sx + ((p[0] - sx) * k) / n, sy + ((p[1] - sy) * k) / n);
    if (n) stroke.swept = p;
  };

  const renderLive = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = liveRef.current;
      const stroke = current.current;
      if (!canvas) return;
      const ratio = canvas.width / width;
      repaintLive(canvas, (ctx) => {
        if (!stroke || stroke.mode !== 'draw') return;
        ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
        drawStroke(ctx, { ...inkStyle(stroke.ink), points: stroke.predicted.length ? [...stroke.points, ...stroke.predicted] : stroke.points }, false);
      });
    });
  };

  const begin = (e: PointerEvent, canvas: HTMLCanvasElement, captured: boolean) => {
    canvas.setPointerCapture(e.pointerId);
    const p = toPoint(e, canvas.getBoundingClientRect());
    const stylusErase = penErases(e);
    const mode = tool === 'eraser' || stylusErase ? 'erase' : 'draw';
    const ink: InkTool = drawing ? (tool as InkTool) : useUi.getState().lastInkTool;
    current.current = { pointerId: e.pointerId, points: [p], predicted: [], mode, ink, captured, stylus: stylusErase && tool !== 'eraser', swept: null };
    if (mode === 'erase') eraseTo(current.current, p);
    renderLive();
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
    begin(e.nativeEvent, e.currentTarget, false);
  };

  // Stylus under the select tool: the page's text layer is on top of this canvas, so catch
  // the pen on the page (capture phase) and hand the stroke to the canvas. Fingers and the
  // mouse are left alone to select text, open highlights and navigate.
  useEffect(() => {
    const canvas = liveRef.current;
    const page = canvas?.parentElement;
    if (!canvas || !page || !stylusInks) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen' || current.current) return;
      // Post-its take the pen themselves (their own handwriting).
      if ((e.target as Element).closest('button, a, [data-selection-menu], [data-sticky-card]')) return;
      e.preventDefault();
      e.stopPropagation();
      penActive.current = true;
      if (!useUi.getState().penDetected) useUi.getState().set({ penDetected: true });
      canvas.style.pointerEvents = 'auto'; // captured events must reach the canvas
      begin(e, canvas, true);
    };
    // The browser would otherwise start scrolling with the pen and cancel the stroke.
    const onTouch = (e: TouchEvent) => {
      if (penActive.current) e.preventDefault();
    };
    page.addEventListener('pointerdown', onDown, { capture: true });
    page.addEventListener('touchstart', onTouch, { passive: false });
    page.addEventListener('touchmove', onTouch, { passive: false });
    return () => {
      page.removeEventListener('pointerdown', onDown, { capture: true });
      page.removeEventListener('touchstart', onTouch);
      page.removeEventListener('touchmove', onTouch);
    };
  });

  const saveErase = () => {
    const removed = (strokes ?? []).filter((s) => erasingRef.current.has(s.id));
    if (!removed.length) {
      erasingRef.current = new Set();
      return schedulePaint();
    }
    settling.current = true;
    useHistory.getState().commit({ added: {}, removed: { strokes: removed } });
  };

  const saveStroke = (ink: InkTool, points: Point[]) => {
    const s: Stroke = { id: newId(), bookId, page: pageNumber, ...inkStyle(ink), points, createdAt: Date.now() };
    // Paint it onto the committed canvas right away to avoid a flicker before the DB query updates.
    const committed = committedRef.current?.getContext('2d');
    if (committed) drawInk(committed, s);
    known.current.set(s.id, s);
    useHistory.getState().commit({ added: { strokes: [s] }, removed: {} });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // The pen's button works while held: pressing it mid-stroke keeps what was drawn and
    // erases; letting go draws again, without lifting the pen.
    if (e.pointerType === 'pen') {
      const erases = penErases(e);
      if (stroke.mode === 'draw' && erases) {
        if (stroke.points.length > 1) saveStroke(stroke.ink, stroke.points);
        Object.assign(stroke, { mode: 'erase', stylus: true, points: [], swept: null });
      } else if (stroke.mode === 'erase' && stroke.stylus && !erases) {
        saveErase();
        Object.assign(stroke, { mode: 'draw', points: [] });
      }
    }
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toPoint(ev, rect);
      if (stroke.mode === 'erase') eraseTo(stroke, p);
      else stroke.points.push(p);
    }
    stroke.predicted = stroke.mode === 'draw' ? predictedPoints(e.nativeEvent, (ev) => toPoint(ev, rect)) : [];
    renderLive();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (e.pointerType === 'pen') penActive.current = false;
    const stroke = current.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    current.current = null;
    if (stroke.captured) e.currentTarget.style.pointerEvents = interactive ? 'auto' : 'none';

    if (stroke.mode === 'erase') return saveErase();
    if (cancelled || !stroke.points.length) return renderLive();

    saveStroke(stroke.ink, stroke.points);
    renderLive();
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
          // Over the select tool, a stroke in progress keeps the text from being selected.
          userSelect: 'none',
        }}
        onPointerOver={(e) => e.pointerType === 'pen' && setPenHover(true)}
        onPointerLeave={(e) => e.pointerType === 'pen' && !current.current && setPenHover(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        // The pen's side button can open the browser's menu; here it's the eraser.
        onContextMenu={(e) => e.preventDefault()}
      />
    </>
  );
}
