import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db, type ImageItem, type NoteItem, type NotePage, type Notebook, type Point, type ShapeItem, type StrokeItem, type TextItem } from '../../../db/schema';
import { newId } from '../../../db/repo';
import { drawStroke } from '../../../lib/ink';
import { bboxOf, eraserHits, itemsInLasso, screenToLocal, transformItems, type Transform, type Vec } from '../../../lib/notes/geometry';
import { defaultInk, drawItems, drawShape } from '../../../lib/notes/render';
import { edgeNear, projectOnEdge, type Edge } from '../../../lib/notes/ruler';
import { recognizeShape, type RecognizedShape } from '../../../lib/notes/shapes';
import { useUi } from '../../../store/ui';
import { sizeCanvas } from '../../reader/canvasSize';
import { useNoteEditor } from './editorStore';
import ImageItemView from './ImageItemView';
import { cloneItems, commitItems } from './items';
import SelectionOverlay from './SelectionOverlay';
import TextItemView from './TextItemView';

export interface View {
  /** World point (page points) at the surface's top-left corner. */
  x: number;
  y: number;
  /** Screen px per point. */
  zoom: number;
}

interface Props {
  notebook: Notebook;
  page: NotePage;
  /** Size of the surface on screen, in px. */
  width: number;
  height: number;
  view: View;
  /** Paper or PDF page, drawn under everything. */
  background?: ReactNode;
  /** Infinite canvas: the parent pans with fingers, so never let the browser scroll. */
  infinite?: boolean;
  /** Degrees the parent has CSS-rotated this surface by (around its center), to map input back. */
  rotation?: number;
}

const ERASER_RADIUS_PX = 10;
/** How close to a ruler edge (screen px) a stroke must start to follow it. */
const RULER_REACH = 28;
const HOLD_MS = 550;

type Gesture =
  | { kind: 'ink'; id: number; tool: 'pen' | 'marker'; points: Point[]; shape: RecognizedShape | null; edge: Edge | null }
  | { kind: 'erase'; id: number }
  | { kind: 'lasso'; id: number; points: Vec[] }
  | { kind: 'shape'; id: number; from: Vec; to: Vec }
  | { kind: 'text'; id: number; at: Vec };

function inkStyle(tool: 'pen' | 'marker') {
  const ui = useUi.getState();
  return tool === 'pen' ? { tool, color: ui.penColor, width: ui.penWidth } : { tool, color: ui.markerColor, width: ui.markerWidth };
}

/**
 * One drawable page (or the whole infinite canvas): paper → images → text → ink → live input
 * → lasso selection. Coordinates are page points; `view` maps them to the screen.
 */
export default function NoteSurface({ notebook, page, width, height, view, background, infinite, rotation = 0 }: Props) {
  const items = useLiveQuery(() => db.noteItems.where('pageId').equals(page.id).toArray(), [page.id]) ?? [];
  const tool = useNoteEditor((s) => s.tool);
  const selection = useNoteEditor((s) => (s.selection?.pageId === page.id ? s.selection : null));
  const editingTextId = useNoteEditor((s) => s.editingTextId);
  const fingerDraws = useNoteEditor((s) => s.fingerDraws);

  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const penActive = useRef(false);
  const holdTimer = useRef(0);
  const frame = useRef(0);
  const erasingRef = useRef<Set<string>>(new Set());
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Transform | null>(null);
  const editOriginal = useRef<TextItem | null>(null);

  const selected = useMemo(() => (selection ? items.filter((i) => selection.ids.includes(i.id)) : []), [items, selection]);
  // While dragging a selection, show the moved copies in place of the originals.
  const moved = useMemo(() => (preview ? new Map(transformItems(selected, preview).map((i) => [i.id, i])) : null), [preview, selected]);
  const shown = useMemo(() => (moved ? items.map((i) => moved.get(i.id) ?? i) : items), [items, moved]);

  // Committed ink.
  useEffect(() => {
    const canvas = inkRef.current;
    if (!canvas) return;
    const ratio = sizeCanvas(canvas, width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio * view.zoom, 0, 0, ratio * view.zoom, -view.x * view.zoom * ratio, -view.y * view.zoom * ratio);
    drawItems(ctx, shown, erasing);
  }, [shown, erasing, width, height, view.x, view.y, view.zoom]);

  useEffect(() => {
    if (liveRef.current) sizeCanvas(liveRef.current, width, height);
  }, [width, height]);

  // Drop a selection whose items disappeared (undo, delete).
  useEffect(() => {
    if (selection && items.length && !items.some((i) => selection.ids.includes(i.id))) useNoteEditor.getState().set({ selection: null });
  }, [items, selection]);

  const toWorld = (e: { clientX: number; clientY: number }): Vec => {
    // The bounding box of a rotated element still has the element's center at its center.
    const rect = liveRef.current!.getBoundingClientRect();
    const [lx, ly] = screenToLocal([e.clientX, e.clientY], [rect.left + rect.width / 2, rect.top + rect.height / 2], rotation, width, height);
    return [lx / view.zoom + view.x, ly / view.zoom + view.y];
  };

  /** The ruler edge a stroke starting here follows, if the ruler is out and the point is next to it. */
  const rulerEdgeAt = (e: { clientX: number; clientY: number }): Edge | null => {
    const { ruler, rulerHost } = useNoteEditor.getState();
    if (!ruler || !rulerHost) return null;
    const h = rulerHost.getBoundingClientRect();
    return edgeNear(ruler, [e.clientX - h.left, e.clientY - h.top], RULER_REACH);
  };

  /** Where a stroke point lands: on the ruler edge when following one. */
  const strokePoint = (e: { clientX: number; clientY: number }, edge: Edge | null): Vec => {
    const { ruler, rulerHost } = useNoteEditor.getState();
    if (edge === null || !ruler || !rulerHost) return toWorld(e);
    const h = rulerHost.getBoundingClientRect();
    const [x, y] = projectOnEdge(ruler, [e.clientX - h.left, e.clientY - h.top], edge);
    return toWorld({ clientX: x + h.left, clientY: y + h.top });
  };

  const renderLive = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = liveRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const ratio = canvas.width / Math.max(1, width);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const g = gesture.current;
      if (!g) return;
      ctx.setTransform(ratio * view.zoom, 0, 0, ratio * view.zoom, -view.x * view.zoom * ratio, -view.y * view.zoom * ratio);
      const ink = inkStyle(g.kind === 'ink' ? g.tool : 'pen');
      if (g.kind === 'ink') {
        if (g.shape) drawShape(ctx, { ...g.shape, color: ink.color, width: ink.width });
        else drawStroke(ctx, { ...ink, points: g.points }, false);
      } else if (g.kind === 'shape') {
        drawShape(ctx, { shape: useNoteEditor.getState().shape, x1: g.from[0], y1: g.from[1], x2: g.to[0], y2: g.to[1], color: ink.color, width: ink.width });
      } else if (g.kind === 'lasso' && g.points.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 1.5 / view.zoom;
        ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
        ctx.beginPath();
        g.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.restore();
      }
    });
  };

  const eraseAt = ([x, y]: Vec) => {
    const hits = eraserHits(items.filter((i) => !erasingRef.current.has(i.id)), x, y, ERASER_RADIUS_PX / view.zoom);
    if (!hits.length) return;
    erasingRef.current = new Set([...erasingRef.current, ...hits.map((i) => i.id)]);
    setErasing(erasingRef.current);
  };

  const nextZ = () => items.reduce((m, i) => Math.max(m, i.z), 0) + 1;

  /** Stylus and mouse use the tool; fingers navigate, unless "finger draws" is on. */
  const usesTool = (e: React.PointerEvent) => e.pointerType !== 'touch' || fingerDraws;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') {
      penActive.current = true;
      if (!useUi.getState().penDetected) useUi.getState().set({ penDetected: true });
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gesture.current) {
      // A second finger: it's a pinch or a pan, not a stroke.
      gesture.current = null;
      clearTimeout(holdTimer.current);
      renderLive();
      return;
    }
    if (!usesTool(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const editor = useNoteEditor.getState();
    if (editor.selection) editor.set({ selection: null });
    const stylusErase = e.pointerType === 'pen' && (e.buttons & 32 || e.buttons & 2);
    const id = e.pointerId;

    if (tool === 'eraser' || stylusErase) {
      gesture.current = { kind: 'erase', id };
      eraseAt(p);
    } else if (tool === 'pen' || tool === 'marker') {
      const edge = rulerEdgeAt(e);
      const start = strokePoint(e, edge);
      gesture.current = { kind: 'ink', id, tool, points: [[start[0], start[1], e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5]], shape: null, edge };
      // Along the ruler the line is already straight; no need for "draw and hold".
      if (edge === null) armHold();
    } else if (tool === 'lasso') {
      gesture.current = { kind: 'lasso', id, points: [p] };
    } else if (tool === 'shape') {
      gesture.current = { kind: 'shape', id, from: p, to: p };
    } else if (tool === 'text') {
      gesture.current = { kind: 'text', id, at: p };
    }
    renderLive();
  };

  // "Draw and hold": a pause at the end of a stroke turns it into a perfect shape.
  const armHold = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      const g = gesture.current;
      if (g?.kind !== 'ink' || g.shape) return;
      const shape = recognizeShape(g.points.map(([x, y]) => [x, y]));
      if (shape) {
        g.shape = shape;
        renderLive();
      }
    }, HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toWorld(ev);
      if (g.kind === 'erase') eraseAt(p);
      else if (g.kind === 'ink' && g.edge !== null) {
        const q = strokePoint(ev, g.edge);
        g.points.push([q[0], q[1], ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5]);
      } else if (g.kind === 'ink') {
        const last = g.points[g.points.length - 1];
        if (g.shape?.shape === 'line') {
          // After snapping to a line, the end keeps following the pen.
          g.shape = { ...g.shape, x2: p[0], y2: p[1] };
        } else if (!g.shape) {
          g.points.push([p[0], p[1], ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5]);
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) * view.zoom > 2) armHold();
        }
      } else if (g.kind === 'lasso') g.points.push(p);
      else if (g.kind === 'shape') g.to = p;
    }
    renderLive();
  };

  const finish = async (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (e.pointerType === 'pen') penActive.current = false;
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    clearTimeout(holdTimer.current);
    renderLive();
    const base = { notebookId: notebook.id, pageId: page.id, z: nextZ(), createdAt: Date.now(), id: newId() };

    if (g.kind === 'erase') {
      const removed = items.filter((i) => erasingRef.current.has(i.id));
      await commitItems([], removed);
      erasingRef.current = new Set();
      setErasing(erasingRef.current);
      return;
    }
    if (cancelled) return;

    if (g.kind === 'ink') {
      const style = inkStyle(g.tool);
      const item: StrokeItem | ShapeItem = g.shape
        ? { ...base, type: 'shape', ...g.shape, color: style.color, width: style.width }
        : { ...base, type: 'stroke', ...style, points: g.points };
      // Paint right away so nothing flickers before the database query catches up.
      const ctx = inkRef.current?.getContext('2d');
      if (ctx) drawItems(ctx, [item]);
      await commitItems([item]);
    } else if (g.kind === 'shape') {
      if (Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]) * view.zoom < 4) return;
      const style = inkStyle('pen');
      const shape = useNoteEditor.getState().shape;
      await commitItems([{ ...base, type: 'shape', shape, x1: g.from[0], y1: g.from[1], x2: g.to[0], y2: g.to[1], color: style.color, width: style.width }]);
    } else if (g.kind === 'lasso') {
      const ids = itemsInLasso(items, g.points).map((i) => i.id);
      useNoteEditor.getState().set({ selection: ids.length ? { pageId: page.id, ids } : null });
    } else if (g.kind === 'text') {
      const [x, y] = g.at;
      const hit = [...items]
        .sort((a, b) => b.z - a.z)
        .find((i): i is TextItem => {
          if (i.type !== 'text') return false;
          const b = bboxOf(i);
          return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        });
      if (hit) {
        editOriginal.current = hit;
        useNoteEditor.getState().set({ editingTextId: hit.id });
        return;
      }
      const editor = useNoteEditor.getState();
      const fontSize = editor.textSize;
      const right = infinite ? x + 320 : page.width - 24;
      const ui = useUi.getState();
      const color = ui.penColor === '#1f2937' ? defaultInk(notebook.paper) : ui.penColor;
      const item: TextItem = { ...base, type: 'text', x, y: y - fontSize * 0.7, w: Math.max(120, Math.min(360, right - x)), text: '', fontSize, color };
      // Saved right away so it shows; it enters the undo history once something is typed.
      await db.noteItems.add(item);
      editOriginal.current = null;
      editor.set({ editingTextId: item.id });
    }
  };

  // Stylus strokes must not scroll the page (Chrome on Android also sends touch events for pens).
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas) return;
    const onTouch = (e: TouchEvent) => {
      if (penActive.current || gesture.current) e.preventDefault();
    };
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onTouch);
    };
  }, []);

  // Selection actions.
  const replaceSelected = (next: NoteItem[]) => commitItems(next, selected);
  const actions = {
    onCommit: (t: Transform) => {
      setPreview(null);
      replaceSelected(transformItems(selected, t));
    },
    onRecolor: (color: string) =>
      replaceSelected(selected.map((i) => (i.type === 'stroke' || i.type === 'shape' || i.type === 'text' ? { ...i, color } : i))),
    onDuplicate: async () => {
      const copies = await cloneItems(selected, page.id, 20);
      await commitItems(copies);
      useNoteEditor.getState().set({ selection: { pageId: page.id, ids: copies.map((i) => i.id) } });
    },
    onCopy: () => useNoteEditor.getState().set({ clipboard: selected }),
    onDelete: () => {
      useNoteEditor.getState().set({ selection: null });
      commitItems([], selected);
    },
  };

  const images = shown.filter((i): i is ImageItem => i.type === 'image').sort((a, b) => a.z - b.z);
  const texts = shown.filter((i): i is TextItem => i.type === 'text').sort((a, b) => a.z - b.z);
  const touchAction = infinite || fingerDraws ? 'none' : 'pan-x pan-y';
  const worldTransform = `translate(${-view.x * view.zoom}px, ${-view.y * view.zoom}px) scale(${view.zoom})`;
  const cursor = tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';

  return (
    <div className="absolute inset-0 overflow-hidden" data-note-surface={page.id}>
      {background}
      {/* Images sit under the ink, so you can write over them. */}
      <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: worldTransform }}>
        {images.map((i) => (
          <ImageItemView key={i.id} item={i} />
        ))}
      </div>
      <canvas ref={inkRef} className="pointer-events-none absolute inset-0 size-full" />
      <canvas
        ref={liveRef}
        className="absolute inset-0 size-full"
        style={{ touchAction, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      />
      {/* Text is above the input canvas but lets pointers through, except the box being typed in. */}
      <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: worldTransform }}>
        {texts.map((i) => (
          <TextItemView key={i.id} item={i} editing={editingTextId === i.id} original={editingTextId === i.id ? editOriginal.current : null} />
        ))}
      </div>
      {selected.length > 0 && (
        <SelectionOverlay items={selected} view={view} rotation={rotation} preview={preview} onPreview={setPreview} {...actions} />
      )}
    </div>
  );
}
