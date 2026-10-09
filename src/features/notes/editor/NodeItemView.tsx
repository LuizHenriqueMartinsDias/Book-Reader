import { useEffect, useRef, useState } from 'react';
import type { NodeItem } from '../../../db/schema';
import { nodeTextBox } from '../../../lib/notes/diagram';
import { useNoteEditor } from './editorStore';
import { commitItems } from './items';

const lineHeight = 1.3;

/** The typed text of a diagram box, centered in it (the box itself is drawn on the ink canvas). */
export default function NodeItemView({ item, editing }: { item: NodeItem; editing: boolean }) {
  const [text, setText] = useState(item.text);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // The box as it was when editing started, to save the change as one undoable step.
  const original = useRef<NodeItem | null>(null);

  useEffect(() => setText(item.text), [item.text]);

  useEffect(() => {
    if (!editing) return;
    original.current = item;
    const area = areaRef.current;
    area?.focus({ preventScroll: true });
    area?.setSelectionRange(area.value.length, area.value.length);
    // Only when editing starts: later changes to the item are this edit's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function finish() {
    useNoteEditor.getState().set({ editingTextId: null });
    const before = original.current;
    original.current = null;
    const value = text.replace(/\s+$/, '');
    if (before && before.text !== value) commitItems([{ ...item, text: value }], [before]);
  }

  const box = nodeTextBox(item);
  const style: React.CSSProperties = { left: box.x, top: box.y, width: box.w, height: box.h, fontSize: item.fontSize, lineHeight, color: item.color };

  return (
    <div className="absolute flex items-center justify-center text-center" style={style}>
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
          className="pointer-events-auto block max-h-full w-full resize-none overflow-hidden rounded-sm bg-transparent text-center outline-1 outline-amber-500 outline-dashed"
          style={{ font: 'inherit', lineHeight, color: 'inherit', fieldSizing: 'content' } as React.CSSProperties}
        />
      ) : (
        <div className="break-words whitespace-pre-wrap">{item.text}</div>
      )}
    </div>
  );
}
