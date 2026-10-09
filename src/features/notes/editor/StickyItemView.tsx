import { Minus, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STICKY_COLORS, STICKY_HEADER, STICKY_ICON, STICKY_INK } from '../../../lib/notes/sticky';

const PAD = 6;
const lineHeight = 1.35;

export type StickyDrag = 'move' | 'resize';

/** What a post-it card shows, in the units of the layer it's in. */
export interface StickyLook {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text: string;
  fontSize: number;
  collapsed?: boolean;
}

interface Props {
  item: StickyLook;
  /** Notebook: typing only after a tap (the pen writes on it otherwise). Book: always typeable (`live`). */
  editing?: boolean;
  live?: boolean;
  /** Draw the paper here (book); in a notebook it's on the ink canvas, under the writing. */
  paper?: boolean;
  /** Dragging by the strip (move) or the corner (resize): screen px since the press; `done` when let go. */
  onDrag: (mode: StickyDrag, dx: number, dy: number, done: 'no' | 'drop' | 'cancel') => void;
  onChange: (patch: Partial<StickyLook>) => void;
  /** New text, when typing ends (and, live, after a pause). */
  onText: (text: string) => void;
  /** It needs to be this tall to fit its text. */
  onGrow: (h: number) => void;
  onDelete: () => void;
  onEditEnd?: () => void;
}

/**
 * A post-it card: the strip to drag it by with color / fold / delete, its typed text, the corner
 * to resize it. Folded, a small icon. Used by notebooks and by books.
 */
export default function StickyItemView({ item, editing = false, live = false, paper = false, onDrag, onChange, onText, onGrow, onDelete, onEditEnd }: Props) {
  const [text, setText] = useState(item.text);
  const [palette, setPalette] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const startText = useRef(item.text);
  const drag = useRef<{ mode: StickyDrag; id: number; start: [number, number] } | null>(null);
  const typing = editing || live;

  useEffect(() => setText(item.text), [item.text]);

  useEffect(() => {
    if (!editing) return;
    startText.current = item.text;
    const area = areaRef.current;
    area?.setSelectionRange(area.value.length, area.value.length);
    area?.focus({ preventScroll: true });
    // Only when editing starts: later changes to the item are this edit's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Live (book) post-its save shortly after typing stops.
  useEffect(() => {
    if (!live || text === item.text) return;
    const t = setTimeout(() => onText(text.replace(/\s+$/, '')), 500);
    return () => clearTimeout(t);
  }, [live, text, item.text, onText]);

  // It grows to fit its text.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || item.collapsed) return;
    const ro = new ResizeObserver(() => {
      const needed = STICKY_HEADER + el.scrollHeight + PAD;
      if (needed > item.h + 1) onGrow(needed);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.h, item.collapsed, onGrow]);

  function finish() {
    const value = text.replace(/\s+$/, '');
    if (live ? value !== item.text : value !== startText.current) onText(value);
    onEditEnd?.();
  }

  const grab = (mode: StickyDrag) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { mode, id: e.pointerId, start: [e.clientX, e.clientY] };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (d?.id === e.pointerId) onDrag(d.mode, e.clientX - d.start[0], e.clientY - d.start[1], 'no');
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current;
      if (d?.id !== e.pointerId) return;
      drag.current = null;
      onDrag(d.mode, e.clientX - d.start[0], e.clientY - d.start[1], 'drop');
    },
    onPointerCancel: (e: React.PointerEvent) => {
      const d = drag.current;
      if (d?.id !== e.pointerId) return;
      drag.current = null;
      onDrag(d.mode, 0, 0, 'cancel');
    },
  });
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  if (item.collapsed)
    return (
      <button
        title={item.text ? `Post-it: ${item.text.slice(0, 80)}` : 'Post-it (toque para abrir)'}
        className="pointer-events-auto absolute touch-none rounded-[2px] shadow-md ring-1 ring-black/10"
        style={{ left: item.x, top: item.y, width: STICKY_ICON, height: STICKY_ICON, background: `linear-gradient(225deg, transparent 6px, ${item.color} 6px)` }}
        {...stop}
        onClick={() => onChange({ collapsed: false })}
      />
    );

  const icon = Math.max(10, Math.min(14, STICKY_HEADER - 8));
  return (
    <div
      className={`absolute ${paper ? 'pointer-events-auto shadow-md ring-1 ring-black/5' : ''}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h, color: STICKY_INK, background: paper ? item.color : undefined }}
    >
      <div
        className="pointer-events-auto flex cursor-move touch-none items-center justify-end gap-1 px-1"
        style={{ height: STICKY_HEADER, background: paper ? 'rgb(0 0 0 / 0.06)' : undefined }}
        {...grab('move')}
      >
        {palette ? (
          STICKY_COLORS.map((c) => (
            <button
              key={c}
              title="Cor"
              {...stop}
              onClick={() => {
                setPalette(false);
                if (c !== item.color) onChange({ color: c });
              }}
              className="rounded-full ring-1 ring-black/20"
              style={{ width: icon, height: icon, background: c }}
            />
          ))
        ) : (
          <>
            <button title="Cor" {...stop} onClick={() => setPalette(true)} className="rounded-full ring-1 ring-black/25" style={{ width: icon, height: icon, background: item.color }} />
            <button title="Recolher" {...stop} onClick={() => onChange({ collapsed: true })} className="opacity-60 hover:opacity-100">
              <Minus style={{ width: icon, height: icon }} />
            </button>
            <button title="Apagar post-it" {...stop} onClick={onDelete} className="opacity-60 hover:opacity-100">
              <X style={{ width: icon, height: icon }} />
            </button>
          </>
        )}
      </div>
      <div ref={bodyRef} style={{ padding: PAD, paddingTop: PAD / 2, fontSize: item.fontSize, lineHeight }}>
        {typing ? (
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={finish}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') areaRef.current?.blur();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            rows={Math.max(1, text.split('\n').length)}
            placeholder="Escreva…"
            className="pointer-events-auto block w-full resize-none overflow-hidden bg-transparent outline-none"
            style={{ font: 'inherit', lineHeight, color: 'inherit', fieldSizing: 'content' } as React.CSSProperties}
          />
        ) : (
          <div className="break-words whitespace-pre-wrap">{item.text}</div>
        )}
      </div>
      <div
        title="Redimensionar"
        className="pointer-events-auto absolute right-0 bottom-0 cursor-nwse-resize touch-none"
        style={{ width: 16, height: 16, background: 'linear-gradient(135deg, transparent 55%, rgb(0 0 0 / 0.18) 55%)' }}
        {...grab('resize')}
      />
    </div>
  );
}
