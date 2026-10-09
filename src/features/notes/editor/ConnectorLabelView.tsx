import { useEffect, useRef, useState } from 'react';
import type { ConnectorItem } from '../../../db/schema';
import type { Vec } from '../../../lib/notes/geometry';
import { useNoteEditor } from './editorStore';
import { commitItems } from './items';

/** The text on a diagram arrow, halfway along it, on a patch of paper so the line doesn't cross it. */
export default function ConnectorLabelView({ item, at, editing, paper }: { item: ConnectorItem; at: Vec; editing: boolean; paper: string }) {
  const [text, setText] = useState(item.label);
  const areaRef = useRef<HTMLInputElement>(null);
  const original = useRef<ConnectorItem | null>(null);

  useEffect(() => setText(item.label), [item.label]);

  useEffect(() => {
    if (!editing) return;
    original.current = item;
    areaRef.current?.focus({ preventScroll: true });
    areaRef.current?.select();
    // Only when editing starts: later changes to the item are this edit's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function finish() {
    useNoteEditor.getState().set({ editingTextId: null });
    const before = original.current;
    original.current = null;
    const value = text.trim();
    if (before && before.label !== value) commitItems([{ ...item, label: value }], [before]);
  }

  if (!editing && !item.label) return null;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded px-1 whitespace-nowrap"
      style={{ left: at[0], top: at[1], fontSize: item.fontSize, lineHeight: 1.3, color: item.color, background: paper }}
    >
      {editing ? (
        <input
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || e.key === 'Enter') areaRef.current?.blur();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Texto"
          className="pointer-events-auto bg-transparent text-center outline-1 outline-amber-500 outline-dashed"
          style={{ font: 'inherit', color: 'inherit', width: `${Math.max(4, text.length + 1)}ch` }}
        />
      ) : (
        item.label
      )}
    </div>
  );
}
