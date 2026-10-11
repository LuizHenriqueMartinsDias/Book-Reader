import { ClipboardCopy, CopyPlus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Guide } from '../../../lib/notes/diagram';
import type { NoteItem } from '../../../db/schema';
import { bboxOf, rotateVec, unionBox, type Transform } from '../../../lib/notes/geometry';
import { PEN_COLORS } from '../../../store/ui';

interface Props {
  items: NoteItem[];
  /** World point at the surface's top-left and px per point. */
  view: { x: number; y: number; zoom: number };
  /** The surface's on-screen rotation: pointer movement is turned back into page directions. */
  rotation: number;
  preview: Transform | null;
  onPreview: (t: Transform | null) => void;
  onCommit: (t: Transform) => void;
  onRecolor: (color: string) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  /** A tap on the selection without moving it (a selected diagram box: edit its text). */
  onTap?: () => void;
  /** More buttons for what's selected (a diagram box's shape, an arrow's style…), before the colors. */
  extra?: ReactNode;
  /** Extra room (px) between the box and the action bar, for handles around the selection. */
  clearance?: number;
  /** Adjusts a move (in page points) to line things up, with guide lines to show. */
  snap?: (dx: number, dy: number) => { dx: number; dy: number; guides: Guide[] };
}

const HANDLE = 22;

/** Dashed box around the lasso selection: drag to move, corner to resize, plus quick actions. */
export default function SelectionOverlay({ items, view, rotation, preview, onPreview, onCommit, onRecolor, onDuplicate, onCopy, onDelete, onTap, extra, clearance = 0, snap }: Props) {
  const drag = useRef<{ mode: 'move' | 'resize'; start: [number, number]; id: number } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /**
   * The action bar is over the screen, not in the page (which clips what goes past its edges, and
   * may be turned): placed by where the selection is on screen, above it if there's room, else
   * below, and kept on screen.
   */
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const placeMenu = useRef(() => {});
  placeMenu.current = () => {
    const sel = boxRef.current?.getBoundingClientRect();
    const bar = menuRef.current;
    if (!sel || !bar) return;
    // Scrolled away: no bar stuck at the screen's edge.
    if (sel.bottom < 0 || sel.top > innerHeight) return setMenuAt(null);
    const [w, h] = [bar.offsetWidth, bar.offsetHeight];
    const above = sel.top - h - 8 - clearance;
    const top = above >= 8 ? above : Math.max(8, Math.min(sel.bottom + 12 + clearance, innerHeight - h - 8));
    const left = Math.max(8, Math.min(sel.left, innerWidth - w - 8));
    setMenuAt((at) => (at && at.left === left && at.top === top ? at : { left, top }));
  };
  useLayoutEffect(() => placeMenu.current());
  // The page scrolling under it, or the window changing size.
  useEffect(() => {
    const place = () => placeMenu.current();
    addEventListener('scroll', place, true);
    addEventListener('resize', place);
    return () => {
      removeEventListener('scroll', place, true);
      removeEventListener('resize', place);
    };
  }, []);
  const box = unionBox(items.map(bboxOf));
  if (!box) return null;

  const t = preview ?? { dx: 0, dy: 0, scale: 1, origin: [box.x, box.y] as [number, number] };
  const shown = {
    x: t.origin[0] + (box.x - t.origin[0]) * t.scale + t.dx,
    y: t.origin[1] + (box.y - t.origin[1]) * t.scale + t.dy,
    w: box.w * t.scale,
    h: box.h * t.scale,
  };
  const left = (shown.x - view.x) * view.zoom;
  const top = (shown.y - view.y) * view.zoom;
  const width = shown.w * view.zoom;
  const height = shown.h * view.zoom;

  const transformFor = (e: React.PointerEvent): Transform => {
    const d = drag.current!;
    const [sx, sy] = rotateVec([e.clientX - d.start[0], e.clientY - d.start[1]], -rotation);
    const dx = sx / view.zoom;
    const dy = sy / view.zoom;
    if (d.mode === 'move') {
      const snapped = snap?.(dx, dy) ?? { dx, dy };
      return { dx: snapped.dx, dy: snapped.dy, scale: 1, origin: [box.x, box.y] };
    }
    const scale = Math.max(0.1, Math.max((box.w + dx) / box.w, (box.h + dy) / box.h));
    return { dx: 0, dy: 0, scale, origin: [box.x, box.y] };
  };

  const start = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, start: [e.clientX, e.clientY], id: e.pointerId };
  };
  const move = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    onPreview(transformFor(e));
    if (drag.current.mode === 'move' && snap) {
      const [sx, sy] = rotateVec([e.clientX - drag.current.start[0], e.clientY - drag.current.start[1]], -rotation);
      setGuides(snap(sx / view.zoom, sy / view.zoom).guides);
    }
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    const tr = transformFor(e);
    drag.current = null;
    setGuides([]);
    if (Math.abs(tr.dx) + Math.abs(tr.dy) > 0.5 || Math.abs(tr.scale - 1) > 0.005) onCommit(tr);
    else {
      onPreview(null);
      onTap?.();
    }
  };

  return (
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute z-30 bg-pink-500 ${g.axis === 'x' ? 'top-0 bottom-0 w-px' : 'right-0 left-0 h-px'}`}
          style={g.axis === 'x' ? { left: (g.at - view.x) * view.zoom } : { top: (g.at - view.y) * view.zoom }}
        />
      ))}
      <div
        ref={boxRef}
        className="absolute z-30 cursor-move touch-none rounded-sm border-2 border-dashed border-sky-500 bg-sky-500/5"
        style={{ left: left - 4, top: top - 4, width: width + 8, height: height + 8 }}
        onPointerDown={start('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="absolute -right-3 -bottom-3 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-sky-500 shadow"
          style={{ width: HANDLE, height: HANDLE }}
          onPointerDown={start('resize')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      {!preview &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-40 flex w-max items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 text-[var(--app-fg)] shadow-lg"
            style={{ left: menuAt?.left ?? 0, top: menuAt?.top ?? 0, visibility: menuAt ? 'visible' : 'hidden' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {extra && (
              <>
                {extra}
                <div className="mx-1 h-5 w-px bg-[var(--border)]" />
              </>
            )}
            {PEN_COLORS.map((c) => (
              <button key={c} title="Mudar cor" onClick={() => onRecolor(c)} className="size-6 rounded-full ring-1 ring-black/10" style={{ background: c }} />
            ))}
            <div className="mx-1 h-5 w-px bg-[var(--border)]" />
            <button title="Duplicar (Ctrl+D)" className="rounded-md p-1.5 hover:bg-[var(--app-bg)]" onClick={onDuplicate}>
              <CopyPlus className="size-4" />
            </button>
            <button title="Copiar (Ctrl+C)" className="rounded-md p-1.5 hover:bg-[var(--app-bg)]" onClick={onCopy}>
              <ClipboardCopy className="size-4" />
            </button>
            <button title="Apagar (Delete)" className="rounded-md p-1.5 text-red-600 hover:bg-[var(--app-bg)]" onClick={onDelete}>
              <Trash2 className="size-4" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
