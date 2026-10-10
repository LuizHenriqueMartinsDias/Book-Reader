import { useLiveQuery } from 'dexie-react-hooks';
import { Pin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type Highlight, type Note } from '../../db/schema';
import { deleteNote, newId, putNote } from '../../db/repo';
import { flatToc, tocTitleAt } from '../../lib/epub';
import { loadOutline } from '../../lib/pdf';
import { chapterAtPage, groupConsecutive } from './noteGroups';
import { useReader } from './readerStore';
import { jumpTo } from './Sidebar';
import { useHistory } from '../../store/history';
import { useUi } from '../../store/ui';
import { pinNote } from './StickyLayer';

type Filter = 'all' | 'page' | 'highlights' | 'notes' | 'stickies';

type Entry = { kind: 'note'; note: Note; highlight?: Highlight } | { kind: 'highlight'; highlight: Highlight };

const entryPage = (e: Entry) => (e.kind === 'note' ? e.note.page : e.highlight.page);
const entryCfi = (e: Entry) => (e.kind === 'note' ? (e.note.cfi ?? e.highlight?.cfi) : e.highlight.cfi);

const FILTERS: { id: Filter; label: string; test: (e: Entry) => boolean }[] = [
  { id: 'all', label: 'Tudo', test: () => true },
  { id: 'highlights', label: 'Destaques', test: (e) => e.kind === 'highlight' || !!e.highlight },
  { id: 'notes', label: 'Notas', test: (e) => e.kind === 'note' && !e.note.color },
  { id: 'stickies', label: 'Post-its', test: (e) => e.kind === 'note' && !!e.note.color },
];

/** The chapter of a spot in the book: the PDF's outline, or the EPUB's table of contents. */
function useChapterOf(): (e: Entry) => string | null {
  const doc = useReader((s) => s.doc);
  const epub = useReader((s) => s.epub);
  const [pdfChapter, setPdfChapter] = useState<((page: number) => string | null) | null>(null);

  useEffect(() => {
    setPdfChapter(null);
    if (doc) loadOutline(doc).then((outline) => setPdfChapter(() => chapterAtPage(outline))).catch(() => {});
  }, [doc]);

  return useMemo(() => {
    if (epub) {
      const toc = flatToc(epub);
      return (e: Entry) => {
        const cfi = entryCfi(e);
        const section = cfi ? epub.spine.get(cfi) : null;
        return section ? tocTitleAt(toc, section.href, null) || null : null;
      };
    }
    return (e: Entry) => pdfChapter?.(entryPage(e)) ?? null;
  }, [epub, pdfChapter]);
}

export default function NotesPanel() {
  const bookId = useReader((s) => s.bookId);
  const currentPage = useReader((s) => s.currentPage);
  const focusNoteId = useReader((s) => s.focusNoteId);
  const epub = useReader((s) => s.format === 'epub');
  const unit = epub ? 'Posição' : 'Página';
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const chapterOf = useChapterOf();

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

  // Every note (with the passage it comments on, if any) and every highlight without a note, in reading order.
  const linked = new Set(notes?.map((n) => n.highlightId));
  const entries: Entry[] = [
    ...(notes ?? []).map((note): Entry => ({ kind: 'note', note, highlight: byId.get(note.highlightId ?? '') })),
    ...(highlights ?? []).filter((h) => !linked.has(h.id)).map((highlight): Entry => ({ kind: 'highlight', highlight })),
  ];
  const position = (e: Entry) => (e.kind === 'note' ? e.note.createdAt : (e.highlight.rects[0]?.[1] ?? e.highlight.createdAt));
  const test = filter === 'page' ? (e: Entry) => entryPage(e) === currentPage : FILTERS.find((f) => f.id === filter)!.test;
  const shown = entries
    .filter(test)
    .filter((e) => (e.kind === 'note' ? matches(e.note.body) || matches(e.highlight?.text ?? '') : matches(e.highlight.text)))
    .sort((a, b) => entryPage(a) - entryPage(b) || position(a) - position(b));
  const groups = groupConsecutive(shown, chapterOf);

  async function addPageNote() {
    const now = Date.now();
    const { currentCfi } = useReader.getState();
    const note: Note = { id: newId(), bookId, page: currentPage, cfi: currentCfi ?? undefined, body: '', createdAt: now, updatedAt: now };
    await putNote(note);
    useReader.setState({ focusNoteId: note.id });
  }

  const pills = [
    ...FILTERS,
    // EPUB positions are too fine-grained for a "this page" filter.
    ...(epub ? [] : [{ id: 'page' as const, label: `${unit} ${currentPage}` }]),
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Buscar nas anotações"
          className="h-9 min-w-0 flex-1 rounded-full border border-[var(--border)] bg-transparent px-3.5 text-sm outline-none focus:border-amber-500"
        />
        <button
          onClick={addPageNote}
          title={`Nova nota aqui (${unit.toLowerCase()} ${currentPage})`}
          className="flex h-9 items-center gap-1 rounded-full bg-amber-500 px-3 text-sm font-semibold text-stone-900 hover:bg-amber-400"
        >
          <Plus className="size-4" /> Nota
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {pills.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`h-8 rounded-full px-3 ${filter === id ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'border border-[var(--border)] text-[var(--muted)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.length ? (
        groups.map((group, i) => (
          <section key={i} className="flex flex-col gap-2.5">
            {group.title && <h3 className="pt-2 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">{group.title}</h3>}
            {group.items.map((e) =>
              e.kind === 'note' ? (
                <NoteItem key={e.note.id} note={e.note} highlight={e.highlight} autoFocus={e.note.id === focusNoteId} />
              ) : (
                <HighlightItem key={e.highlight.id} highlight={e.highlight} />
              ),
            )}
          </section>
        ))
      ) : (
        <Empty>
          {q
            ? 'Nada encontrado.'
            : filter === 'page'
              ? 'Nenhuma anotação nesta página.'
              : filter === 'all'
                ? 'Nenhuma anotação ainda. Selecione um trecho do texto ou use “+ Nota”.'
                : 'Nenhuma anotação deste tipo.'}
        </Empty>
      )}
    </div>
  );
}

const Unit = () => <>{useReader((s) => (s.format === 'epub' ? 'Posição' : 'Página'))}</>;

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-[var(--muted)]">{children}</p>;

/** A highlight's color as a light wash behind its card. */
const tint = (color: string) => ({ background: `color-mix(in srgb, ${color} 16%, var(--panel))` });

function Quote({ highlight }: { highlight: Highlight }) {
  return (
    <blockquote className="border-l-4 pl-2.5 font-serif text-[15px] leading-relaxed italic" style={{ borderColor: highlight.color }}>
      “{highlight.text}”
    </blockquote>
  );
}

function HighlightItem({ highlight }: { highlight: Highlight }) {
  return (
    <button className="flex flex-col gap-2 rounded-xl p-3 text-left hover:brightness-95" style={tint(highlight.color)} onClick={() => jumpTo(highlight.cfi ?? highlight.page)}>
      <Quote highlight={highlight} />
      <span className="text-xs text-[var(--muted)]">
        <Unit /> {highlight.page} · {new Date(highlight.createdAt).toLocaleDateString('pt-BR')}
      </span>
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
    <div
      ref={card}
      className={`group rounded-xl p-3 focus-within:ring-2 focus-within:ring-amber-500 ${highlight || note.color ? '' : 'border border-[var(--border)]'}`}
      style={highlight ? tint(highlight.color) : note.color ? tint(note.color) : undefined}
    >
      <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--muted)]">
        <button className="hover:text-[var(--accent-text)] hover:underline" onClick={() => jumpTo(note.cfi ?? note.page)}>
          <Unit /> {note.page}
        </button>
        <span className="flex items-center gap-2">
          {note.color ? (
            <span title="Post-it" className="size-3 rounded-[2px] ring-1 ring-black/10" style={{ background: note.color }} />
          ) : (
            <button
              title={note.cfi ? 'Mostrar como post-it ao lado do trecho' : 'Colar na página como post-it'}
              className="flex items-center gap-0.5 hover:text-[var(--accent-text)]"
              onClick={async () => {
                let stuck: Note;
                if (note.cfi) {
                  // EPUB: an icon in the margin by its passage.
                  stuck = { ...note, color: useUi.getState().stickyColor, updatedAt: Date.now() };
                } else {
                  // PDF: beside its highlight if it has one, else at the top right of its page.
                  const h = note.highlightId ? await db.highlights.get(note.highlightId) : undefined;
                  const r = h?.rects[0];
                  stuck = pinNote(note, r ? r[0] + r[2] + 8 : null, r ? Math.max(4, r[1] - 4) : 12);
                }
                await useHistory.getState().commit({ added: { notes: [stuck] }, removed: { notes: [note] } });
                jumpTo(note.cfi ?? note.page);
              }}
            >
              <Pin className="size-3.5" /> Colar
            </button>
          )}
          {new Date(note.updatedAt).toLocaleDateString('pt-BR')}
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
