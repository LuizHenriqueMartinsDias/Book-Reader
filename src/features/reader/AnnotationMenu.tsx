import { Copy, NotebookPen, StickyNote, Trash2 } from 'lucide-react';
import { db, type Highlight } from '../../db/schema';
import { newId, putNote } from '../../db/repo';
import { useHistory } from '../../store/history';
import { HIGHLIGHT_COLORS, useUi } from '../../store/ui';
import { sendQuoteToNotebook } from '../notes/SendQuoteDialog';
import { useReader } from './readerStore';

export type MenuTarget =
  | { kind: 'selection'; text: string; createHighlights: (color: string) => Highlight[] }
  | { kind: 'highlight'; highlight: Highlight };

interface Props {
  x: number;
  y: number;
  target: MenuTarget;
  onClose: () => void;
}

export function openNote(noteId: string) {
  useReader.setState({ sidebarTab: 'notes', focusNoteId: noteId });
  useUi.getState().set({ sidebarOpen: true });
}

const newNote = (h: Highlight) => ({
  id: newId(),
  bookId: h.bookId,
  page: h.page,
  highlightId: h.id,
  cfi: h.cfi,
  body: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Floating menu shared by the PDF and EPUB readers: highlight a selection (or add a note to
 * it), or recolor / annotate / remove an existing highlight. Changes go through the undo history.
 */
export default function AnnotationMenu({ x, y, target, onClose }: Props) {
  const current = target.kind === 'highlight' ? target.highlight.color : null;

  async function highlight(color: string, withNote = false) {
    if (target.kind === 'selection') {
      const created = target.createHighlights(color);
      if (created.length) {
        await useHistory.getState().commit({ added: { highlights: created }, removed: {} });
        if (withNote) {
          const note = newNote(created[0]);
          await putNote(note);
          openNote(note.id);
        }
      }
    } else if (!withNote) {
      const old = target.highlight;
      await useHistory.getState().commit({ added: { highlights: [{ ...old, color }] }, removed: { highlights: [old] } });
    } else {
      const h = target.highlight;
      const existing = await db.notes.where('highlightId').equals(h.id).first();
      const note = existing ?? newNote(h);
      if (!existing) await putNote(note);
      openNote(note.id);
    }
    onClose();
  }

  /** Highlights the passage (if it isn't yet) and sends it to a notebook with a link back here. */
  async function sendToNotebook() {
    let h = target.kind === 'highlight' ? target.highlight : null;
    if (target.kind === 'selection') {
      const created = target.createHighlights(HIGHLIGHT_COLORS[0]);
      if (created.length) await useHistory.getState().commit({ added: { highlights: created }, removed: {} });
      h = created[0] ?? null;
    }
    const text = target.kind === 'selection' ? target.text : target.highlight.text;
    const { bookId, currentPage } = useReader.getState();
    const book = await db.books.get(bookId);
    onClose();
    sendQuoteToNotebook({ text, source: { bookId, title: book?.title ?? 'Livro', page: h?.page ?? currentPage, cfi: h?.cfi } });
  }

  const left = Math.min(Math.max(8, x - 150), window.innerWidth - 308);
  const top = Math.min(y + 8, window.innerHeight - 56);

  return (
    <div
      data-selection-menu
      className="fixed z-50 flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-xl"
      style={{ left, top }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          title="Destacar"
          onClick={() => highlight(c)}
          className={`size-7 rounded-full border-2 ${current === c ? 'border-amber-600' : 'border-transparent'}`}
        >
          <span className="block size-full rounded-full ring-1 ring-black/10" style={{ background: c }} />
        </button>
      ))}
      <div className="mx-1 h-6 w-px bg-[var(--border)]" />
      <button title="Adicionar nota" className="rounded-md p-1.5 hover:bg-[var(--app-bg)]" onClick={() => highlight(current ?? HIGHLIGHT_COLORS[0], true)}>
        <StickyNote className="size-5" />
      </button>
      <button title="Enviar para caderno" className="rounded-md p-1.5 hover:bg-[var(--app-bg)]" onClick={sendToNotebook}>
        <NotebookPen className="size-5" />
      </button>
      {target.kind === 'selection' ? (
        <button
          title="Copiar"
          className="rounded-md p-1.5 hover:bg-[var(--app-bg)]"
          onClick={() => {
            navigator.clipboard?.writeText(target.text);
            onClose();
          }}
        >
          <Copy className="size-5" />
        </button>
      ) : (
        <button
          title="Remover destaque"
          className="rounded-md p-1.5 text-red-600 hover:bg-[var(--app-bg)]"
          onClick={async () => {
            await useHistory.getState().commit({ added: {}, removed: { highlights: [target.highlight] } });
            onClose();
          }}
        >
          <Trash2 className="size-5" />
        </button>
      )}
    </div>
  );
}
