import { useLiveQuery } from 'dexie-react-hooks';
import { StickyNote } from 'lucide-react';
import { db } from '../../db/schema';
import { useReader } from './readerStore';

/**
 * Highlight rectangles sit under the text layer so text stays selectable; ReaderPage finds
 * clicked highlights via elementsFromPoint and the `data-highlight-id` attribute.
 */
export default function HighlightLayer({ pageNumber, scale }: { pageNumber: number; scale: number }) {
  const bookId = useReader((s) => s.bookId);
  const highlights = useLiveQuery(() => db.highlights.where({ bookId, page: pageNumber }).toArray(), [bookId, pageNumber]);
  const notes = useLiveQuery(() => db.notes.where({ bookId, page: pageNumber }).toArray(), [bookId, pageNumber]);

  const openNote = (noteId: string) => {
    useReader.getState().set({ sidebarTab: 'notes', focusNoteId: noteId });
    window.dispatchEvent(new CustomEvent('reader:open-sidebar'));
  };

  const pageNotes = notes?.filter((n) => !n.highlightId || !highlights?.some((h) => h.id === n.highlightId)) ?? [];

  return (
    <div className="pointer-events-none absolute inset-0">
      {highlights?.map((h) =>
        h.rects.map(([x, y, w, hh], i) => (
          <div
            key={`${h.id}-${i}`}
            data-highlight-id={h.id}
            className="pointer-events-auto absolute rounded-[2px]"
            style={{
              left: x * scale,
              top: y * scale,
              width: w * scale,
              height: hh * scale,
              background: h.color,
              opacity: 0.4,
              mixBlendMode: 'var(--highlight-blend)' as React.CSSProperties['mixBlendMode'],
            }}
          />
        )),
      )}
      {highlights?.map((h) => {
        const note = notes?.find((n) => n.highlightId === h.id);
        if (!note) return null;
        const [x, y] = h.rects[0];
        return (
          <button
            key={`note-${h.id}`}
            title={note.body}
            onClick={() => openNote(note.id)}
            className="pointer-events-auto absolute z-10 rounded bg-amber-400 p-0.5 text-stone-900 shadow"
            style={{ left: Math.max(2, x * scale - 22), top: y * scale }}
          >
            <StickyNote className="size-3.5" />
          </button>
        );
      })}
      {pageNotes.length > 0 && (
        <button
          title={`${pageNotes.length} nota(s) nesta página`}
          onClick={() => openNote(pageNotes[0].id)}
          className="pointer-events-auto absolute top-2 right-2 z-10 flex items-center gap-1 rounded bg-amber-400 px-1.5 py-0.5 text-xs font-medium text-stone-900 shadow"
        >
          <StickyNote className="size-3.5" />
          {pageNotes.length}
        </button>
      )}
    </div>
  );
}
