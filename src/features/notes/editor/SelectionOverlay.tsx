import { ClipboardCopy, CopyPlus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { NoteItem } from '../../../db/schema';
import { bboxOf, unionBox, type Transform } from '../../../lib/notes/geometry';
import { PEN_COLORS } from '../../../store/ui';

interface Props {
  items: NoteItem[];
  /** World point at the surface's top-left and px per point. */
  view: { x: number; y: number; zoom: number };
  preview: Transform | null;
  onPreview: (t: Transform | null) => void;
  onCommit: (t: Transform) => void;
  onRecolor: (color: string) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

const HANDLE = 22;

/** Dashed box around the lasso selection: drag to move, corner to resize, plus quick actions. */
export default function SelectionOverlay({ items, view, preview, onPreview, onCommit, onRecolor, onDuplicate, onCopy, onDelete }: Props) {
  const drag = useRef<{ mode: 'move' | 'resize'; start: [number, number]; id: number } | null>(null);
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
    const dx = (e.clientX - d.start[0]) / view.zoom;
    const dy = (e.clientY - d.start[1]) / view.zoom;
    if (d.mode === 'move') return { dx, dy, scale: 1, origin: [box.x, box.y] };
    const scale = Math.max(0.1, Math.max((box.w + dx) / box.w, (box.h + dy) / box.h));
    return { dx: 0, dy: 0, scale, origin: [box.x, box.y] };
  };

  const start = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, start: [e.clientX, e.clientY], id: e.pointerId };
  };
  const move = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) onPreview(transformFor(e));
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    const tr = transformFor(e);
    drag.current = null;
    if (Math.abs(tr.dx) + Math.abs(tr.dy) > 0.5 || Math.abs(tr.scale - 1) > 0.005) onCommit(tr);
    else onPreview(null);
  };

  const actionsAbove = top > 56;
  return (
    <>
      <div
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
      {!preview && (
        <div
          className="absolute z-30 flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 text-[var(--app-fg)] shadow-lg"
          style={{ left: Math.max(4, left), top: actionsAbove ? top - 50 : top + height + 12 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
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
        </div>
      )}
    </>
  );
}
