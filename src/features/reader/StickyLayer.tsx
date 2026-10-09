import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useState } from 'react';
import { db, type Note } from '../../db/schema';
import { newId, putNote } from '../../db/repo';
import { STICKY_HEADER } from '../../lib/notes/sticky';
import type { PageSize } from '../../lib/pdf';
import { useHistory } from '../../store/history';
import { useUi } from '../../store/ui';
import StickyItemView, { type StickyDrag, type StickyLook } from '../notes/editor/StickyItemView';
import { useReader } from './readerStore';

/** A post-it stuck on a book page, in page points. */
export const BOOK_STICKY = { w: 140, h: 120, fontSize: 12 };
const MIN = { w: 80, h: STICKY_HEADER + 30 };

/** Width of a PDF page in points, from the page on screen (A4's if it isn't there). */
function pageWidth(page: number) {
  const el = document.querySelector<HTMLElement>(`.page[data-page="${page}"]`);
  return el ? el.offsetWidth / Number(el.dataset.scale || 1) : 595;
}

/** A note stuck on its page as a post-it at (x, y), or as near as fits; null x: by the right edge. */
export function pinNote(note: Note, x: number | null, y: number): Note {
  const room = pageWidth(note.page) - BOOK_STICKY.w - 4;
  const left = Math.max(4, Math.min(x ?? room, room));
  return { ...note, pin: { x: left, y, w: BOOK_STICKY.w, h: BOOK_STICKY.h }, color: note.color ?? useUi.getState().stickyColor, collapsed: false, updatedAt: Date.now() };
}

/**
 * The post-its on a PDF page: notes stuck on it, moved by their strip, resized by their corner,
 * folded to an icon, typed in place (and listed in the notes panel). With the post-it tool, a
 * tap on the page sticks a new one there.
 */
export default function StickyLayer({ pageNumber, scale, size }: { pageNumber: number; scale: number; size: PageSize }) {
  const bookId = useReader((s) => s.bookId);
  const placing = useUi((s) => s.tool === 'sticky');
  const notes = useLiveQuery(() => db.notes.where({ bookId, page: pageNumber }).toArray(), [bookId, pageNumber]);
  const [drag, setDrag] = useState<{ id: string; mode: StickyDrag; dx: number; dy: number } | null>(null);
  const fresh = useReader((s) => s.freshStickyId);
  const setFresh = (id: string | null) => useReader.setState({ freshStickyId: id });

  const change = (before: Note, after: Note) => useHistory.getState().commit({ added: { notes: [after] }, removed: { notes: [before] } });

  async function place(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(4, (e.clientX - r.left) / scale - BOOK_STICKY.w / 2), size.width - BOOK_STICKY.w - 4);
    const y = Math.min(Math.max(4, (e.clientY - r.top) / scale - STICKY_HEADER / 2), size.height - BOOK_STICKY.h - 4);
    const now = Date.now();
    const note = pinNote({ id: newId(), bookId, page: pageNumber, body: '', createdAt: now, updatedAt: now }, x, y);
    await useHistory.getState().commit({ added: { notes: [note] }, removed: {} });
    setFresh(note.id);
  }

  const onGrow = useCallback((note: Note) => (h: number) => note.pin && putNote({ ...note, pin: { ...note.pin, h } }), []);

  const pinned = (notes ?? []).filter((n): n is Note & { pin: NonNullable<Note['pin']> } => !!n.pin);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {placing && <div className="pointer-events-auto absolute inset-0 cursor-copy" onPointerUp={place} />}
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        {pinned.map((n) => {
          let { x, y, w, h } = n.pin;
          if (drag?.id === n.id) {
            if (drag.mode === 'move') [x, y] = [x + drag.dx, y + drag.dy];
            else [w, h] = [Math.max(MIN.w, w + drag.dx), Math.max(MIN.h, h + drag.dy)];
          }
          // Kept on the page even if it was stuck near an edge.
          x = Math.min(Math.max(0, x), Math.max(0, size.width - (n.collapsed ? 26 : w)));
          const look: StickyLook = { x, y, w, h, color: n.color ?? useUi.getState().stickyColor, text: n.body, fontSize: BOOK_STICKY.fontSize, collapsed: n.collapsed };
          return (
            <StickyItemView
              key={n.id}
              item={look}
              live
              paper
              editing={fresh === n.id}
              onEditEnd={() => setFresh(null)}
              onDrag={(mode, sx, sy, done) => {
                const [dx, dy] = [sx / scale, sy / scale];
                if (done === 'no') return setDrag({ id: n.id, mode, dx, dy });
                setDrag(null);
                if (done === 'cancel' || Math.hypot(sx, sy) < 2) return;
                const pin = mode === 'move' ? { ...n.pin, x: n.pin.x + dx, y: n.pin.y + dy } : { ...n.pin, w: Math.max(MIN.w, n.pin.w + dx), h: Math.max(MIN.h, n.pin.h + dy) };
                change(n, { ...n, pin, updatedAt: Date.now() });
              }}
              onChange={(patch) => change(n, { ...n, color: patch.color ?? n.color, collapsed: patch.collapsed ?? n.collapsed, updatedAt: Date.now() })}
              onText={(body) => putNote({ ...n, body, updatedAt: Date.now() })}
              onGrow={onGrow(n)}
              onDelete={() => useHistory.getState().commit({ added: {}, removed: { notes: [n] } })}
            />
          );
        })}
      </div>
    </div>
  );
}
