import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, ArrowRight, Minus, Plus, Spline, Type, Waypoints } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db, type ConnectorEnd, type ConnectorItem, type ImageItem, type NodeItem, type NoteItem, type NotePage, type Notebook, type Point, type ShapeItem, type StrokeItem, type TextItem } from '../../../db/schema';
import { newId } from '../../../db/repo';
import { drawStroke } from '../../../lib/ink';
import { attachedTo, connectorHit, connectorPoints, isConnector, midpoint, nodesById, settle, SIDES, sideDir, sidePoint, type Side } from '../../../lib/notes/connectors';
import { attach, isNode, MIN_NODE, NODE_SIZE, nodeAt, withChildren, withDependents } from '../../../lib/notes/diagram';
import { eraseItem } from '../../../lib/notes/erase';
import { bboxOf, eraserHits, itemsInLasso, screenToLocal, transformItems, type Transform, type Vec } from '../../../lib/notes/geometry';
import { defaultInk, drawConnector, drawItems, drawNode, drawShape } from '../../../lib/notes/render';
import { edgeNear, projectOnEdge, type Edge } from '../../../lib/notes/ruler';
import { recognizeShape, type RecognizedShape } from '../../../lib/notes/shapes';
import { useUi } from '../../../store/ui';
import { sizeCanvas } from '../../reader/canvasSize';
import { useNoteEditor } from './editorStore';
import ImageItemView from './ImageItemView';
import ConnectorLabelView from './ConnectorLabelView';
import { cloneItems, commitItems } from './items';
import NodeItemView from './NodeItemView';
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

/** How close to a ruler edge (screen px) a stroke must start to follow it. */
const RULER_REACH = 28;
const HOLD_MS = 550;

type Gesture =
  | { kind: 'ink'; id: number; tool: 'pen' | 'marker'; points: Point[]; shape: RecognizedShape | null; edge: Edge | null }
  /** `stylus`: erasing because the pen's button is held, so letting go of it goes back to the pen. */
  | { kind: 'erase'; id: number; at: Vec; stylus: boolean }
  | { kind: 'lasso'; id: number; points: Vec[] }
  | { kind: 'shape'; id: number; from: Vec; to: Vec }
  | { kind: 'text'; id: number; at: Vec }
  /**
   * Diagram tool: dragging a box (`hit`) moves it; on an arrow (`picked`) it just selects it;
   * elsewhere it makes a box from `from` to `to`.
   */
  | { kind: 'diagram'; id: number; from: Vec; to: Vec; hit: NodeItem | null; picked: boolean };

/** Dragging out of a box's "+" handle: an arrow to another box, or to where a new box goes. */
interface Linking {
  id: number;
  node: NodeItem;
  side: Side;
  to: Vec;
  /** Where the press started on screen, to tell a tap from a drag. */
  start: Vec;
}

/** Room between a box and the next one made with its "+" handle, in points. */
const NEXT_GAP = 60;
/** How close to an arrow (screen px) a tap must be to pick it. */
const PICK_PX = 10;

/** The stylus' eraser end (32) or side button (2) is down: it erases while held. */
const penErases = (e: { pointerType: string; buttons: number }) => e.pointerType === 'pen' && (e.buttons & 34) !== 0;

/** Ink color for new things: the pen's, or the paper's default ink when the pen has the default. */
function inkColor(notebook: Notebook) {
  const pen = useUi.getState().penColor;
  return pen === '#1f2937' ? defaultInk(notebook.paper) : pen;
}

/** A new diagram box spanning `from`–`to`, or of the usual size centered at `from` after a tap. */
function newNode(from: Vec, to: Vec, zoom: number, notebook: Notebook): Omit<NodeItem, 'id' | 'notebookId' | 'pageId' | 'z' | 'createdAt'> {
  const { nodeShape, nodeFilled, textSize } = useNoteEditor.getState();
  const w = Math.abs(to[0] - from[0]);
  const h = Math.abs(to[1] - from[1]);
  const box =
    w * zoom >= MIN_NODE && h * zoom >= MIN_NODE
      ? { x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]), w, h }
      : { x: from[0] - NODE_SIZE[nodeShape].w / 2, y: from[1] - NODE_SIZE[nodeShape].h / 2, ...NODE_SIZE[nodeShape] };
  return { type: 'node', shape: nodeShape, ...box, color: inkColor(notebook), filled: nodeFilled, width: 2, text: '', fontSize: textSize };
}

/** A new arrow from a box to `to`, styled like the last ones. */
function newConnector(from: NodeItem, to: ConnectorEnd): Omit<ConnectorItem, 'id' | 'notebookId' | 'pageId' | 'z' | 'createdAt'> {
  const { connectorRoute, connectorArrows, textSize } = useNoteEditor.getState();
  return {
    type: 'connector',
    from: { node: from.id, x: from.x + from.w / 2, y: from.y + from.h / 2 },
    to,
    route: connectorRoute,
    arrows: connectorArrows,
    // The color of the box it comes out of.
    color: from.color,
    width: 2,
    label: '',
    fontSize: Math.round(textSize * 0.85),
  };
}

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
  /** Where a hovering pen with its button held is, to show the eraser before it touches. */
  const hoverEraser = useRef<Vec | null>(null);
  const frame = useRef(0);
  const erasingRef = useRef<Set<string>>(new Set());
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  // Partial eraser: what's left of the items it cut so far (shown in their place until saved).
  const piecesRef = useRef<StrokeItem[]>([]);
  const [pieces, setPieces] = useState<StrokeItem[]>([]);
  /** An erase was just saved: keep showing its result until the database query catches up. */
  const settling = useRef(false);
  const [preview, setPreview] = useState<Transform | null>(null);
  const linking = useRef<Linking | null>(null);
  const editOriginal = useRef<TextItem | null>(null);

  const selected = useMemo(() => (selection ? items.filter((i) => selection.ids.includes(i.id)) : []), [items, selection]);
  // While dragging a selection, show the moved copies in place of the originals.
  const moved = useMemo(() => (preview ? new Map(transformItems(selected, preview).map((i) => [i.id, i])) : null), [preview, selected]);
  const shown = useMemo(() => (moved ? items.map((i) => moved.get(i.id) ?? i) : items), [items, moved]);
  // Boxes as they're shown (also mid-drag), for the arrows to follow.
  const nodeMap = useMemo(() => nodesById(shown), [shown]);

  // Committed ink.
  useEffect(() => {
    const canvas = inkRef.current;
    if (!canvas) return;
    const ratio = sizeCanvas(canvas, width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio * view.zoom, 0, 0, ratio * view.zoom, -view.x * view.zoom * ratio, -view.y * view.zoom * ratio);
    drawItems(ctx, pieces.length ? [...shown, ...pieces] : shown, erasing);
  }, [shown, erasing, pieces, width, height, view.x, view.y, view.zoom]);

  const clearErase = () => {
    erasingRef.current = new Set();
    piecesRef.current = [];
    setErasing(erasingRef.current);
    setPieces([]);
  };
  useEffect(() => {
    if (!settling.current) return;
    settling.current = false;
    clearErase();
  }, [items]);

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
      const link = linking.current;
      if (link) {
        ctx.setTransform(ratio * view.zoom, 0, 0, ratio * view.zoom, -view.x * view.zoom * ratio, -view.y * view.zoom * ratio);
        const target = nodeAt(items.filter((i) => i.id !== link.node.id), link.to);
        const c = newConnector(link.node, { node: target?.id, x: link.to[0], y: link.to[1] });
        drawConnector(ctx, c, connectorPoints(c, nodeMap));
        return;
      }
      const g = gesture.current ?? (hoverEraser.current && { kind: 'erase' as const, id: -1, at: hoverEraser.current, stylus: true });
      if (!g) return;
      ctx.setTransform(ratio * view.zoom, 0, 0, ratio * view.zoom, -view.x * view.zoom * ratio, -view.y * view.zoom * ratio);
      const ink = inkStyle(g.kind === 'ink' ? g.tool : 'pen');
      if (g.kind === 'ink') {
        if (g.shape) drawShape(ctx, { ...g.shape, color: ink.color, width: ink.width });
        else drawStroke(ctx, { ...ink, points: g.points }, false);
      } else if (g.kind === 'shape') {
        drawShape(ctx, { shape: useNoteEditor.getState().shape, x1: g.from[0], y1: g.from[1], x2: g.to[0], y2: g.to[1], color: ink.color, width: ink.width });
      } else if (g.kind === 'erase') {
        ctx.save();
        ctx.strokeStyle = 'rgb(120 113 108 / 0.9)';
        ctx.lineWidth = 1.5 / view.zoom;
        ctx.beginPath();
        ctx.arc(g.at[0], g.at[1], useNoteEditor.getState().eraserSize / view.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (g.kind === 'diagram' && !g.hit && (g.to[0] !== g.from[0] || g.to[1] !== g.from[1])) {
        drawNode(ctx, { ...newNode(g.from, g.to, view.zoom, notebook), id: '', notebookId: '', pageId: '', z: 0, createdAt: 0 });
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
    const { eraserMode, eraserSize } = useNoteEditor.getState();
    const radius = eraserSize / view.zoom;
    const live = items.filter((i) => !erasingRef.current.has(i.id));
    if (eraserMode === 'stroke') {
      const nodes = nodesById(live);
      const hits = [...eraserHits(live, x, y, radius), ...live.filter(isConnector).filter((c) => connectorHit(c, nodes, x, y, radius))];
      if (!hits.length) return;
      // Erasing a box erases what's written in it and the arrows on it.
      erasingRef.current = new Set([...erasingRef.current, ...withDependents(hits.map((i) => i.id), items)]);
      setErasing(erasingRef.current);
      return;
    }
    // Partial: cut the saved items it touches (hiding them) and the pieces already cut.
    const hidden = new Set(erasingRef.current);
    const next: StrokeItem[] = [];
    let changed = false;
    for (const item of live) {
      const cut = eraseItem(item, x, y, radius, newId);
      if (!cut) continue;
      hidden.add(item.id);
      next.push(...cut);
      changed = true;
    }
    for (const piece of piecesRef.current) {
      const cut = eraseItem(piece, x, y, radius, newId);
      next.push(...(cut ?? [piece]));
      if (cut) changed = true;
    }
    if (!changed) return;
    erasingRef.current = hidden;
    piecesRef.current = next;
    setErasing(hidden);
    setPieces(next);
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
    const stylusErase = penErases(e);
    const id = e.pointerId;
    hoverEraser.current = null;

    if (tool === 'eraser' || stylusErase) {
      gesture.current = { kind: 'erase', id, at: p, stylus: stylusErase && tool !== 'eraser' };
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
    } else if (tool === 'diagram') {
      // A tap while typing in a box just ends the typing (the text box loses focus).
      if (editor.editingTextId) return;
      // On a box: select it (with its writing) and drag to move; elsewhere: make a box.
      const hit = nodeAt(items, p) ?? null;
      const arrow = hit ? undefined : [...items].sort((a, b) => b.z - a.z).find((i) => isConnector(i) && connectorHit(i, nodeMap, p[0], p[1], PICK_PX / view.zoom));
      if (hit) editor.set({ selection: { pageId: page.id, ids: withChildren([hit.id], items) } });
      else if (arrow) editor.set({ selection: { pageId: page.id, ids: [arrow.id] } });
      gesture.current = { kind: 'diagram', id, from: p, to: p, hit, picked: !!arrow };
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
    if (!gesture.current) {
      // A pen hovering with its button held shows the eraser it's about to be.
      const hover = penErases(e) ? toWorld(e) : null;
      if (hover || hoverEraser.current) {
        hoverEraser.current = hover;
        renderLive();
      }
      return;
    }
    if (gesture.current.id !== e.pointerId) return;
    switchByPenButton(e);
    const g = gesture.current;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toWorld(ev);
      if (g.kind === 'erase') {
        g.at = p;
        eraseAt(p);
      } else if (g.kind === 'ink' && g.edge !== null) {
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
      else if (g.kind === 'shape' || g.kind === 'diagram') g.to = p;
    }
    if (g.kind === 'diagram' && g.hit) setPreview(dragOf(g));
    renderLive();
  };

  const saveErase = async () => {
    const removed = items.filter((i) => erasingRef.current.has(i.id));
    if (!removed.length) return clearErase();
    settling.current = true;
    await commitItems(piecesRef.current, removed);
  };

  const saveInk = async (g: Extract<Gesture, { kind: 'ink' }>) => {
    const style = inkStyle(g.tool);
    const base = { notebookId: notebook.id, pageId: page.id, z: nextZ(), createdAt: Date.now(), id: newId() };
    const item: StrokeItem | ShapeItem = g.shape
      ? { ...base, type: 'shape', ...g.shape, color: style.color, width: style.width }
      : { ...base, type: 'stroke', ...style, points: g.points };
    // Paint right away so nothing flickers before the database query catches up.
    const ctx = inkRef.current?.getContext('2d');
    if (ctx) drawItems(ctx, [item]);
    // Written inside a diagram box: it belongs to the box.
    await commitItems([attach(item, items)]);
  };

  /**
   * The pen's button works while it's held: pressing it mid-stroke keeps what was drawn and
   * starts erasing; letting go goes back to the pen or marker, without lifting the pen.
   */
  const switchByPenButton = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || e.pointerType !== 'pen') return;
    const erases = penErases(e);
    if (g.kind === 'ink' && erases) {
      clearTimeout(holdTimer.current);
      if (g.shape || g.points.length > 1) saveInk(g);
      gesture.current = { kind: 'erase', id: g.id, at: toWorld(e), stylus: true };
    } else if (g.kind === 'erase' && g.stylus && !erases && (tool === 'pen' || tool === 'marker')) {
      saveErase();
      const [x, y] = toWorld(e);
      gesture.current = { kind: 'ink', id: g.id, tool, points: [[x, y, e.pressure || 0.5]], shape: null, edge: null };
      armHold();
    }
  };

  const dragOf = (g: Extract<Gesture, { kind: 'diagram' }>): Transform => ({ dx: g.to[0] - g.from[0], dy: g.to[1] - g.from[1], scale: 1, origin: g.from });

  /** Makes a box; loose writing already inside it becomes its content. Then types in it. */
  const createNode = async (g: Extract<Gesture, { kind: 'diagram' }>) => {
    const node: NodeItem = { ...newNode(g.from, g.to, view.zoom, notebook), id: newId(), notebookId: notebook.id, pageId: page.id, z: nextZ(), createdAt: Date.now() };
    const loose = items.filter((i) => !i.parentId && (i.type === 'stroke' || i.type === 'shape'));
    const adopted = loose.map((i) => attach(i, [node])).filter((i) => i.parentId === node.id);
    await commitItems([node, ...adopted], loose.filter((i) => adopted.some((a) => a.id === i.id)));
    useNoteEditor.getState().set({ editingTextId: node.id });
  };

  const finish = async (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (e.pointerType === 'pen') penActive.current = false;
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    clearTimeout(holdTimer.current);
    renderLive();
    const base = { notebookId: notebook.id, pageId: page.id, z: nextZ(), createdAt: Date.now(), id: newId() };

    if (g.kind === 'erase') return saveErase();
    if (g.kind === 'diagram' && g.picked) return;
    if (g.kind === 'diagram' && g.hit) {
      const t = dragOf(g);
      if (!cancelled && Math.hypot(t.dx, t.dy) * view.zoom > 3) actions.onCommit(t);
      else setPreview(null);
      return;
    }
    if (cancelled) return;

    if (g.kind === 'ink') {
      await saveInk(g);
    } else if (g.kind === 'shape') {
      if (Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]) * view.zoom < 4) return;
      const style = inkStyle('pen');
      const shape = useNoteEditor.getState().shape;
      await commitItems([{ ...base, type: 'shape', shape, x1: g.from[0], y1: g.from[1], x2: g.to[0], y2: g.to[1], color: style.color, width: style.width }]);
    } else if (g.kind === 'diagram') {
      await createNode(g);
    } else if (g.kind === 'lasso') {
      // A box comes with what's written in it.
      const ids = withChildren(itemsInLasso(items, g.points).map((i) => i.id), items);
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
      // Tapping a diagram box types in it.
      const box = nodeAt(items, g.at);
      if (box) {
        useNoteEditor.getState().set({ editingTextId: box.id });
        return;
      }
      const editor = useNoteEditor.getState();
      const fontSize = editor.textSize;
      const right = infinite ? x + 320 : page.width - 24;
      const color = inkColor(notebook);
      const item: TextItem = { ...base, type: 'text', x, y: y - fontSize * 0.7, w: Math.max(120, Math.min(360, right - x)), text: '', fontSize, color };
      // Saved right away so it shows; it enters the undo history once something is typed.
      await db.noteItems.add(item);
      editOriginal.current = null;
      editor.set({ editingTextId: item.id });
    }
  };

  /** Saves boxes and arrows as one undoable step, settling the arrows' ends. */
  const addDiagram = async (nodes: NodeItem[], arrows: Omit<ConnectorItem, 'id' | 'notebookId' | 'pageId' | 'z' | 'createdAt'>[]) => {
    const base = () => ({ notebookId: notebook.id, pageId: page.id, createdAt: Date.now(), id: newId() });
    const z = nextZ();
    const map = nodesById([...items, ...nodes]);
    const made = arrows.map((a, i) => settle({ ...a, ...base(), z: z + nodes.length + i } as ConnectorItem, map));
    await commitItems([...nodes, ...made]);
  };

  /** A box like `from` (shape, size, look; no text) with its top-left at (x, y). */
  const sibling = (from: NodeItem, x: number, y: number): NodeItem => ({ ...from, id: newId(), x, y, text: '', z: nextZ(), createdAt: Date.now() });

  /** The "+" of a box: the next box on that side (below the ones already there), connected and ready to type in. */
  const addNext = async (from: NodeItem, side: Side) => {
    const [dx, dy] = sideDir(side);
    let x = from.x + dx * (from.w + NEXT_GAP);
    let y = from.y + dy * (from.h + NEXT_GAP);
    const taken = (bx: number, by: number) => items.some((i) => isNode(i) && bx < i.x + i.w && bx + from.w > i.x && by < i.y + i.h && by + from.h > i.y);
    for (let tries = 0; taken(x, y) && tries < 20; tries++) {
      if (dx) y += from.h + NEXT_GAP / 2;
      else x += from.w + NEXT_GAP / 2;
    }
    const next = sibling(from, x, y);
    await addDiagram([next], [newConnector(from, { node: next.id, x, y })]);
    useNoteEditor.getState().set({ selection: null, editingTextId: next.id });
  };

  const linkStart = (node: NodeItem, side: Side) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    linking.current = { id: e.pointerId, node, side, to: toWorld(e), start: [e.clientX, e.clientY] };
  };
  const linkMove = (e: React.PointerEvent) => {
    const link = linking.current;
    if (link?.id !== e.pointerId) return;
    link.to = toWorld(e);
    renderLive();
  };
  const linkEnd = async (e: React.PointerEvent) => {
    const link = linking.current;
    if (link?.id !== e.pointerId) return;
    linking.current = null;
    renderLive();
    if (e.type === 'pointercancel') return;
    // A tap on the handle: the next box on that side.
    if (Math.hypot(e.clientX - link.start[0], e.clientY - link.start[1]) < 8) return addNext(link.node, link.side);
    const target = nodeAt(items.filter((i) => i.id !== link.node.id), link.to);
    if (target) {
      await addDiagram([], [newConnector(link.node, { node: target.id, x: link.to[0], y: link.to[1] })]);
      return;
    }
    // Let go on empty paper: a new box there, connected.
    const next = sibling(link.node, link.to[0] - link.node.w / 2, link.to[1] - link.node.h / 2);
    await addDiagram([next], [newConnector(link.node, { node: next.id, x: link.to[0], y: link.to[1] })]);
    useNoteEditor.getState().set({ selection: null, editingTextId: next.id });
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
      // Writing moved without its box joins whatever box it lands in (or none).
      const ids = new Set(selected.map((i) => i.id));
      const next = transformItems(selected, t);
      const all = [...items.filter((i) => !ids.has(i.id)), ...next];
      const placed = next.map((i) => ((i.type === 'stroke' || i.type === 'shape') && !(i.parentId && ids.has(i.parentId)) ? attach(i, all) : i));
      // Arrows on moved boxes record where their ends are now.
      const map = nodesById(all);
      const arrows = attachedTo(all, new Set(next.filter(isNode).map((n) => n.id)));
      const settled = arrows.map((c) => settle(c, map));
      const changed = arrows.filter((c, i) => settled[i] !== c && !ids.has(c.id));
      const changedIds = new Set(changed.map((c) => c.id));
      commitItems([...placed.map((i) => (changedIds.has(i.id) ? settle(i as ConnectorItem, map) : i)), ...settled.filter((c) => changedIds.has(c.id))], [
        ...selected,
        ...items.filter((i) => changedIds.has(i.id)),
      ]);
    },
    onRecolor: (color: string) =>
      replaceSelected(selected.map((i) => (i.type === 'image' ? i : { ...i, color }))),
    onTap: () => {
      // Tapping a selected box (or arrow) again types in it.
      const boxes = selected.filter(isNode);
      const arrows = selected.filter(isConnector);
      const target = boxes.length === 1 ? boxes[0] : !boxes.length && arrows.length === 1 ? arrows[0] : null;
      if (target) useNoteEditor.getState().set({ selection: null, editingTextId: target.id });
    },
    onDuplicate: async () => {
      const copies = await cloneItems(selected, page.id, 20);
      await commitItems(copies);
      useNoteEditor.getState().set({ selection: { pageId: page.id, ids: copies.map((i) => i.id) } });
    },
    onCopy: () => useNoteEditor.getState().set({ clipboard: selected }),
    onDelete: () => {
      useNoteEditor.getState().set({ selection: null });
      const gone = new Set(withDependents(selected.map((i) => i.id), items));
      commitItems([], items.filter((i) => gone.has(i.id)));
    },
  };

  // What's selected, for diagram controls: one box (with its writing) or one arrow.
  const selectedBoxes = selected.filter(isNode);
  const selectedArrows = selected.filter(isConnector);
  const soleBox = selectedBoxes.length === 1 && !selectedArrows.length ? selectedBoxes[0] : null;
  const soleArrow = !selectedBoxes.length && selectedArrows.length === 1 && selected.length === 1 ? selectedArrows[0] : null;
  const restyle = (patch: Partial<NodeItem> & Partial<ConnectorItem>) => {
    const target = soleBox ?? soleArrow;
    if (target) commitItems([{ ...target, ...patch } as NoteItem], [target]);
  };
  const pill = (active: boolean) => `rounded-md p-1.5 ${active ? 'bg-[var(--app-bg)] text-amber-600' : 'hover:bg-[var(--app-bg)]'}`;
  const extra = soleBox ? (
    <>
      {(['round', 'rect', 'ellipse', 'diamond'] as const).map((shape) => (
        <button key={shape} title="Forma da caixa" className={pill(soleBox.shape === shape)} onClick={() => restyle({ shape })}>
          <span
            className={`block size-4 border-2 border-current ${shape === 'round' ? 'rounded-[5px]' : shape === 'ellipse' ? 'rounded-full' : shape === 'diamond' ? 'scale-75 rotate-45' : ''}`}
          />
        </button>
      ))}
    </>
  ) : soleArrow ? (
    <>
      {(
        [
          ['straight', Minus, 'Reta'],
          ['elbow', Waypoints, 'Em cotovelo'],
          ['curve', Spline, 'Curva'],
        ] as const
      ).map(([route, Icon, label]) => (
        <button
          key={route}
          title={label}
          className={pill(soleArrow.route === route)}
          onClick={() => {
            useNoteEditor.getState().set({ connectorRoute: route });
            restyle({ route });
          }}
        >
          <Icon className="size-4" />
        </button>
      ))}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      {(
        [
          ['end', ArrowRight, 'Ponta no fim'],
          ['both', ArrowLeftRight, 'Pontas nos dois lados'],
          ['none', null, 'Sem ponta'],
        ] as const
      ).map(([arrows, Icon, label]) => (
        <button
          key={arrows}
          title={label}
          className={pill(soleArrow.arrows === arrows)}
          onClick={() => {
            useNoteEditor.getState().set({ connectorArrows: arrows });
            restyle({ arrows });
          }}
        >
          {Icon ? <Icon className="size-4" /> : <span className="block w-4 text-center text-xs leading-4">—</span>}
        </button>
      ))}
      <button title="Texto na seta" className={pill(false)} onClick={() => useNoteEditor.getState().set({ selection: null, editingTextId: soleArrow.id })}>
        <Type className="size-4" />
      </button>
    </>
  ) : null;
  // The "+" handles around a box selected with the diagram tool.
  const handles = tool === 'diagram' && soleBox && !preview && !editingTextId ? soleBox : null;

  const images = shown.filter((i): i is ImageItem => i.type === 'image').sort((a, b) => a.z - b.z);
  const texts = shown.filter((i): i is TextItem => i.type === 'text').sort((a, b) => a.z - b.z);
  const nodes = shown.filter(isNode).sort((a, b) => a.z - b.z);
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
        data-note-input
        className="absolute inset-0 size-full"
        style={{ touchAction, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={() => {
          if (hoverEraser.current && !gesture.current) {
            hoverEraser.current = null;
            renderLive();
          }
        }}
        // The pen's side button can open the browser's menu; here it's the eraser.
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Text is above the input canvas but lets pointers through, except the box being typed in. */}
      <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: worldTransform }}>
        {nodes.map((i) => (
          <NodeItemView key={i.id} item={i} editing={editingTextId === i.id} />
        ))}
        {shown.filter(isConnector).map((c) => (
          <ConnectorLabelView key={c.id} item={c} at={midpoint(connectorPoints(c, nodeMap))} editing={editingTextId === c.id} paper={notebook.paper.color} />
        ))}
        {texts.map((i) => (
          <TextItemView key={i.id} item={i} editing={editingTextId === i.id} original={editingTextId === i.id ? editOriginal.current : null} />
        ))}
      </div>
      {selected.length > 0 && (
        <SelectionOverlay items={selected} view={view} rotation={rotation} preview={preview} onPreview={setPreview} extra={extra} clearance={handles ? 30 : 0} {...actions} />
      )}
      {handles &&
        SIDES.map((side) => {
          const [px, py] = sidePoint(handles, side);
          const [dx, dy] = sideDir(side);
          return (
            <div
              key={side}
              title="Toque: nova caixa ligada deste lado · Arraste: ligar a outra caixa"
              className="absolute z-30 flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none items-center justify-center rounded-full border-2 border-white bg-sky-500 text-white shadow"
              style={{ left: (px - view.x) * view.zoom + dx * 26, top: (py - view.y) * view.zoom + dy * 26 }}
              onPointerDown={linkStart(handles, side)}
              onPointerMove={linkMove}
              onPointerUp={linkEnd}
              onPointerCancel={linkEnd}
            >
              <Plus className="size-4" />
            </div>
          );
        })}
    </div>
  );
}
