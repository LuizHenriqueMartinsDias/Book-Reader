import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type Highlight, type Note } from '../../db/schema';
import { deleteNote, newId, putNote } from '../../db/repo';
import { useReader } from './readerStore';
import { jumpTo } from './Sidebar';

type Filter = 'page' | 'all' | 'highlights';

export default function NotesPanel() {
  const bookId = useReader((s) => s.bookId);
  const currentPage = useReader((s) => s.currentPage);
  const focusNoteId = useReader((s) => s.focusNoteId);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const notes = useLiveQuery(() => db.notes.where('bookId').equals(bookId).toArray(), [bookId]);
  const highlights = useLiveQuery(() => db.highlights.where('bookId').equals(bookId).toArray(), [bookId]);
  const byId = useMemo(() => new Map(highlights?.map((h) => [h.id, h])), [highlights]);

  // A focused note must be visible regardless of the current filter.
  useEffect(() => {
    if (focusNoteId) {
      setFilter('all');
      setQuery('');
    }
  }, [focusNoteId]);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  const noteItems = (notes ?? [])
    .filter((n) => filter !== 'page' || n.page === currentPage)
    .filter((n) => matches(n.body) || matches(byId.get(n.highlightId ?? '')?.text ?? ''))
    .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  const linked = new Set(notes?.map((n) => n.highlightId));
  const bareHighlights = (highlights ?? [])
    .filter((h) => !linked.has(h.id) && matches(h.text))
    .sort((a, b) => a.page - b.page || (a.rects[0]?.[1] ?? 0) - (b.rects[0]?.[1] ?? 0));

  async function addPageNote() {
    const now = Date.now();
    const note: Note = { id: newId(), bookId, page: currentPage, body: '', createdAt: now, updatedAt: now };
    await putNote(note);
    useReader.setState({ focusNoteId: note.id });
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar notas…"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-amber-500"
        />
        <button
          onClick={addPageNote}
          title={`Nova nota na página ${currentPage}`}
          className="flex items-center gap-1 rounded-md bg-amber-500 px-2.5 text-sm font-medium text-stone-900 hover:bg-amber-400"
        >
          <Plus className="size-4" /> Nota
        </button>
      </div>
      <div className="flex gap-1 text-xs">
        {(
          [
            ['all', 'Todas'],
            ['page', `Página ${currentPage}`],
            ['highlights', 'Destaques'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-full border px-2.5 py-1 ${filter === id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)] text-[var(--muted)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === 'highlights' ? (
        bareHighlights.length ? (
          bareHighlights.map((h) => <HighlightItem key={h.id} highlight={h} />)
        ) : (
          <Empty>Nenhum destaque sem nota.</Empty>
        )
      ) : noteItems.length ? (
        noteItems.map((n) => <NoteItem key={n.id} note={n} highlight={byId.get(n.highlightId ?? '')} autoFocus={n.id === focusNoteId} />)
      ) : (
        <Empty>
          {filter === 'page' ? 'Nenhuma nota nesta página.' : 'Nenhuma nota ainda. Selecione um trecho do texto ou use “+ Nota”.'}
        </Empty>
      )}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-[var(--muted)]">{children}</p>;

function Quote({ highlight }: { highlight: Highlight }) {
  return (
    <blockquote className="border-l-4 pl-2 text-sm italic opacity-80" style={{ borderColor: highlight.color }}>
      {highlight.text}
    </blockquote>
  );
}

function HighlightItem({ highlight }: { highlight: Highlight }) {
  return (
    <button className="rounded-lg border border-[var(--border)] p-2.5 text-left hover:bg-[var(--app-bg)]" onClick={() => jumpTo(highlight.page)}>
      <div className="mb-1 text-xs text-[var(--muted)]">Página {highlight.page}</div>
      <Quote highlight={highlight} />
    </button>
  );
}

function NoteItem({ note, highlight, autoFocus }: { note: Note; highlight?: Highlight; autoFocus: boolean }) {
  const [body, setBody] = useState(note.body);
  const ref = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ref.current?.focus({ preventScroll: true });
    useReader.setState({ focusNoteId: null });
  }, [autoFocus]);

  // Autosave shortly after typing stops.
  useEffect(() => {
    if (body === note.body) return;
    const t = setTimeout(() => putNote({ ...note, body, updatedAt: Date.now() }), 400);
    return () => clearTimeout(t);
  }, [body, note]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  return (
    <div ref={card} className="group rounded-lg border border-[var(--border)] p-2.5 focus-within:border-amber-500">
      <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--muted)]">
        <button className="hover:text-amber-600 hover:underline" onClick={() => jumpTo(note.page)}>
          Página {note.page}
        </button>
        <span className="flex items-center gap-2">
          {new Date(note.updatedAt).toLocaleDateString()}
          <button
            title="Excluir nota"
            className="opacity-0 group-hover:opacity-100 hover:text-red-600 [@media(hover:none)]:opacity-100"
            onClick={() => (!note.body.trim() || confirm('Excluir esta nota?')) && deleteNote(note.id)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>
      {highlight && <Quote highlight={highlight} />}
      <textarea
        ref={ref}
        value={body}
        rows={2}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => body !== note.body && putNote({ ...note, body, updatedAt: Date.now() })}
        placeholder="Escreva sua nota…"
        className="mt-1.5 w-full resize-none bg-transparent text-sm outline-none"
      />
    </div>
  );
}
