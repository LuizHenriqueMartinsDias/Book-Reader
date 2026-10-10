import { BookOpen, GripHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { navigate } from '../../../App';
import { db, type TextItem } from '../../../db/schema';
import { commitItems } from './items';
import { useNoteEditor } from './editorStore';

interface Props {
  item: TextItem;
  editing: boolean;
  /** The item as it was before this editing session (null when it was just created). */
  original: TextItem | null;
  /** Dragging the box by its handle while typing: screen px from where the drag began. */
  onMove?: (dx: number, dy: number, done: 'no' | 'drop' | 'cancel') => void;
}

const lineHeight = 1.35;

/** Opens the book a quote came from, at the quoted spot. */
export function openSource(source: NonNullable<TextItem['source']>) {
  const at = source.cfi ? `?cfi=${encodeURIComponent(source.cfi)}` : source.page ? `?p=${source.page}` : '';
  navigate(`#/read/${source.bookId}${at}`);
}

/** A typed text box, positioned in page points (its parent is scaled to the zoom). */
export default function TextItemView({ item, editing, original, onMove }: Props) {
  const [text, setText] = useState(item.text);
  const drag = useRef<{ id: number; start: [number, number] } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(item.text), [item.text]);

  useEffect(() => {
    if (editing) areaRef.current?.focus({ preventScroll: true });
  }, [editing]);

  // Remember the rendered height so selection boxes and exports know it.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (h && Math.abs((item.h ?? 0) - h) > 1)
        db.noteItems.update(item.id, (i) => {
          if (i.type === 'text') i.h = h;
        });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id, item.h]);

  function finish() {
    useNoteEditor.getState().set({ editingTextId: null });
    const value = text.replace(/\s+$/, '');
    if (!value) {
      // An emptied box goes away; if it existed before, that's an undoable delete.
      if (original) commitItems([], [original]);
      else db.noteItems.delete(item.id);
      return;
    }
    const updated = { ...item, text: value };
    if (!original) commitItems([updated]);
    // Moved by its handle while typing counts too: one undo puts back both.
    else if (original.text !== value || original.x !== item.x || original.y !== item.y) commitItems([updated], [original]);
  }

  const style: React.CSSProperties = {
    left: item.x,
    top: item.y,
    width: item.w,
    fontSize: item.fontSize,
    lineHeight,
    color: item.color,
  };

  return (
    <div ref={boxRef} className="absolute" style={style}>
      {editing && onMove && (
        <div
          title="Arraste para mover"
          aria-label="Mover caixa de texto"
          className="pointer-events-auto absolute bottom-full left-0 flex h-[1.3em] min-h-5 w-[2.6em] min-w-10 cursor-move touch-none items-center justify-center rounded-t-md bg-amber-500 text-stone-900"
          onPointerDown={(e) => {
            // Without the default, the press would end the typing (blur) before the drag.
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, start: [e.clientX, e.clientY] };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d?.id === e.pointerId) onMove(e.clientX - d.start[0], e.clientY - d.start[1], 'no');
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (d?.id !== e.pointerId) return;
            drag.current = null;
            onMove(e.clientX - d.start[0], e.clientY - d.start[1], 'drop');
            areaRef.current?.focus({ preventScroll: true });
          }}
          onPointerCancel={(e) => {
            if (drag.current?.id !== e.pointerId) return;
            drag.current = null;
            onMove(0, 0, 'cancel');
          }}
        >
          <GripHorizontal style={{ width: '1em', height: '1em' }} />
        </div>
      )}
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
          placeholder="Digite…"
          className="pointer-events-auto block w-full resize-none overflow-hidden rounded-sm bg-transparent p-1 outline-1 outline-amber-500 outline-dashed"
          style={{ font: 'inherit', lineHeight, color: 'inherit', fieldSizing: 'content' } as React.CSSProperties}
        />
      ) : (
        <div className="p-1 break-words whitespace-pre-wrap">{item.text}</div>
      )}
      {item.source && !editing && (
        <button
          className="pointer-events-auto mt-0.5 flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[var(--accent-text)]"
          style={{ fontSize: Math.max(10, item.fontSize * 0.7) }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openSource(item.source!)}
        >
          <BookOpen style={{ width: '1em', height: '1em' }} /> Abrir no livro
        </button>
      )}
    </div>
  );
}
