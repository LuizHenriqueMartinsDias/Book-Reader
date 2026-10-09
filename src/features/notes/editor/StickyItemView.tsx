import { Minus, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db, type StickyItem } from '../../../db/schema';
import { STICKY_COLORS, STICKY_HEADER, STICKY_ICON, STICKY_INK } from '../../../lib/notes/sticky';
import { useNoteEditor } from './editorStore';
import { commitItems } from './items';

const PAD = 6;
const lineHeight = 1.35;

export type StickyDrag = 'move' | 'resize';

interface Props {
  item: StickyItem;
  editing: boolean;
  /** Dragging by the strip (move) or the corner (resize): screen px since the press; `done` when let go. */
  onDrag: (mode: StickyDrag, dx: number, dy: number, done: 'no' | 'drop' | 'cancel') => void;
  onChange: (next: StickyItem) => void;
  onDelete: () => void;
}

/**
 * A post-it's controls and text over its paper (drawn on the ink canvas): the strip to drag it
 * by with color / fold / delete, its typed text, the corner to resize it. Folded, a small icon.
 */
export default function StickyItemView({ item, editing, onDrag, onChange, onDelete }: Props) {
  const [text, setText] = useState(item.text);
  const [palette, setPalette] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const original = useRef<StickyItem | null>(null);
  const drag = useRef<{ mode: StickyDrag; id: number; start: [number, number] } | null>(null);

  useEffect(() => setText(item.text), [item.text]);

  useEffect(() => {
    if (!editing) return;
    original.current = item;
    const area = areaRef.current;
    area?.setSelectionRange(area.value.length, area.value.length);
    area?.focus({ preventScroll: true });
    // Only when editing starts: later changes to the item are this edit's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // It grows to fit its text (quietly: the size follows the text, not an edit of its own).
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || item.collapsed) return;
    const ro = new ResizeObserver(() => {
      const needed = STICKY_HEADER + el.scrollHeight + PAD;
      if (needed > item.h + 1)
        db.noteItems.update(item.id, (i) => {
          if (i.type === 'sticky') i.h = needed;
        });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id, item.h, item.collapsed]);

  function finish() {
    useNoteEditor.getState().set({ editingTextId: null });
    const before = original.current;
    original.current = null;
    const value = text.replace(/\s+$/, '');
    if (before && before.text !== value) commitItems([{ ...item, text: value }], [before]);
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
      onDrag(d.mode, e.clientX - d.start[0], e.clientY - d.start[1], e.type === 'pointercancel' ? 'cancel' : 'drop');
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
        onClick={() => onChange({ ...item, collapsed: false })}
      />
    );

  const icon = Math.max(10, Math.min(14, STICKY_HEADER - 8));
  return (
    <div className="absolute" style={{ left: item.x, top: item.y, width: item.w, height: item.h, color: STICKY_INK }}>
      <div className="pointer-events-auto flex cursor-move touch-none items-center justify-end gap-1 px-1" style={{ height: STICKY_HEADER }} {...grab('move')}>
        {palette ? (
          STICKY_COLORS.map((c) => (
            <button
              key={c}
              title="Cor"
              {...stop}
              onClick={() => {
                setPalette(false);
                if (c !== item.color) onChange({ ...item, color: c });
              }}
              className="rounded-full ring-1 ring-black/20"
              style={{ width: icon, height: icon, background: c }}
            />
          ))
        ) : (
          <>
            <button title="Cor" {...stop} onClick={() => setPalette(true)} className="rounded-full ring-1 ring-black/25" style={{ width: icon, height: icon, background: item.color }} />
            <button title="Recolher" {...stop} onClick={() => onChange({ ...item, collapsed: true })} className="opacity-60 hover:opacity-100">
              <Minus style={{ width: icon, height: icon }} />
            </button>
            <button title="Apagar post-it" {...stop} onClick={onDelete} className="opacity-60 hover:opacity-100">
              <X style={{ width: icon, height: icon }} />
            </button>
          </>
        )}
      </div>
      <div ref={bodyRef} style={{ padding: PAD, paddingTop: PAD / 2, fontSize: item.fontSize, lineHeight }}>
        {editing ? (
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
