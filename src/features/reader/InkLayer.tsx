import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, type InkTool, type Point, type Stroke } from '../../db/schema';
import { newId } from '../../db/repo';
import { drawStroke, strokeHit } from '../../lib/ink';
import type { PageSize } from '../../lib/pdf';
import { useHistory } from '../../store/history';
import { useUi } from '../../store/ui';
import { sizeCanvas } from './canvasSize';
import { useReader } from './readerStore';

const ERASER_RADIUS_PX = 10;

/** The stylus' eraser end (32) or side button (2) is down: it erases while held. */
const penErases = (e: { pointerType: string; buttons: number }) => e.pointerType === 'pen' && (e.buttons & 34) !== 0;

/** Current color and width settings of an ink tool. */
function inkStyle(tool: InkTool) {
  const ui = useUi.getState();
  return tool === 'pen' ? { tool, brush: ui.penBrush, color: ui.penColor, width: ui.penWidth } : { tool, color: ui.markerColor, width: ui.markerWidth };
}

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
  const strokes = useLiveQuery(() => db.strokes.where({ bookId, page: pageNumber }).sortBy('createdAt'), [bookId, pageNumber]);
  // Strokes being erased: the ref is read when the gesture ends (state may not have caught up
  // with a quick swipe), the state hides them right away.
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const erasingRef = useRef<Set<string>>(new Set());

  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  /**
   * `erase` also covers the stylus' eraser end and side button, whatever tool is selected.
   * `captured`: a stylus stroke started under the select tool (see the page listener below).
   * `stylus`: erasing because the pen's button is held, so letting go of it draws again.
   */
  const current = useRef<{ pointerId: number; points: Point[]; mode: 'draw' | 'erase'; ink: InkTool; captured: boolean; stylus: boolean } | null>(null);
  const penActive = useRef(false);
  const [penHover, setPenHover] = useState(false);
  const frame = useRef(0);

  const drawing = tool === 'pen' || tool === 'marker';
  const interactive = drawing || tool === 'eraser';
  /** Under the select tool a stylus still writes, with the last ink tool picked. */
  const stylusInks = tool === 'select' && stylusAlwaysInks;
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
    const hits = (strokes ?? []).filter((s) => !erasingRef.current.has(s.id) && strokeHit(s.points, x, y, radius + s.width / 2));
    if (!hits.length) return;
    erasingRef.current = new Set([...erasingRef.current, ...hits.map((s) => s.id)]);
    setErasing(erasingRef.current);
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
      if (!stroke || stroke.mode !== 'draw') return;
      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
      drawStroke(ctx, { ...inkStyle(stroke.ink), points: stroke.points }, false);
    });
  };

  const begin = (e: PointerEvent, canvas: HTMLCanvasElement, captured: boolean) => {
    canvas.setPointerCapture(e.pointerId);
    const p = toPoint(e, canvas.getBoundingClientRect());
    const stylusErase = penErases(e);
    const mode = tool === 'eraser' || stylusErase ? 'erase' : 'draw';
    const ink: InkTool = drawing ? (tool as InkTool) : useUi.getState().lastInkTool;
    current.current = { pointerId: e.pointerId, points: [p], mode, ink, captured, stylus: stylusErase && tool !== 'eraser' };
    if (mode === 'erase') eraseAt(p[0], p[1]);
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
    const clear = () => {
      erasingRef.current = new Set();
      setErasing(erasingRef.current);
    };
    if (removed.length) useHistory.getState().commit({ added: {}, removed: { strokes: removed } }).then(clear);
    else clear();
  };

  const saveStroke = (ink: InkTool, points: Point[]) => {
    const s: Stroke = { id: newId(), bookId, page: pageNumber, ...inkStyle(ink), points, createdAt: Date.now() };
    // Paint it onto the committed canvas right away to avoid a flicker before the DB query updates.
    const committed = committedRef.current?.getContext('2d');
    if (committed) drawStroke(committed, s);
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
        Object.assign(stroke, { mode: 'erase', stylus: true, points: [] });
      } else if (stroke.mode === 'erase' && stroke.stylus && !erases) {
        saveErase();
        Object.assign(stroke, { mode: 'draw', points: [] });
      }
    }
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
