import { useLiveQuery } from 'dexie-react-hooks';
import { FilePlus2, Moon, MoreHorizontal, Search, Sun, SunDim, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { db, type Book } from '../../db/schema';
import { restoreBackup } from '../../lib/backup';
import { normalize } from '../../lib/catalog/text';
import { useUi, type LibrarySort, type Theme } from '../../store/ui';
import FolderBar, { folderCounts, inFolder, useFolderFilter } from '../FolderBar';
import HomeLayout from '../HomeLayout';
import { BackupMenuSection, BackupReminder } from './BackupPanel';
import BookCard from './BookCard';
import ContinueReading from './ContinueReading';
import { ACCEPTED_FILES, importBook, isBookFile } from './importBook';

const THEMES: { id: Theme; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Claro' },
  { id: 'sepia', icon: SunDim, label: 'Sépia' },
  { id: 'dark', icon: Moon, label: 'Escuro' },
];

const SORTS: { id: LibrarySort; label: string }[] = [
  { id: 'recent', label: 'Lidos recentemente' },
  { id: 'added', label: 'Adicionados recentemente' },
  { id: 'title', label: 'Título' },
];

const SORTERS: Record<LibrarySort, (a: Book, b: Book) => number> = {
  recent: (a, b) => b.lastOpenedAt - a.lastOpenedAt || b.addedAt - a.addedAt,
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
};

export default function LibraryPage() {
  const books = useLiveQuery(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []);
  const folders = useLiveQuery(() => db.bookFolders.orderBy('order').toArray(), []) ?? [];
  const [filter, setFilter] = useFolderFilter('books');
  const { theme, set, librarySort } = useUi();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const q = normalize(query);
  const shown = books
    ?.filter((b) => inFolder(b.folderId, filter) && (!q || normalize(`${b.title} ${b.author ?? ''}`).includes(q)))
    .sort(SORTERS[librarySort]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  async function handleFiles(files: Iterable<File>) {
    const pdfs = [...files].filter(isBookFile);
    if (!pdfs.length) return setMessage('Nenhum PDF ou EPUB encontrado.');
    const results = [];
    for (const [i, file] of pdfs.entries()) {
      setBusy(`Importando ${i + 1}/${pdfs.length}: ${file.name}`);
      // Books added while a folder is open go into it.
      results.push(await importBook(file, { folderId: filter || null }));
    }
    setBusy(null);
    const errors = results.filter((r) => r.status === 'error');
    const existing = results.filter((r) => r.status === 'exists') as Extract<(typeof results)[number], { title: string }>[];
    setMessage(
      [
        errors.length && `Falha ao importar: ${errors.map((e) => e.name).join(', ')}`,
        existing.length && `Já estava na biblioteca: ${existing.map((e) => e.title).join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · ') || null,
    );
    if (results.length === 1 && results[0].status === 'added') navigate(`#/read/${results[0].id}`);
  }

  async function handleRestore(file: File) {
    try {
      const { annotations, notebooks, missingBooks } = await restoreBackup(file);
      setMessage(
        `${annotations} anotações e ${notebooks} caderno(s) restaurados.` +
          (missingBooks.length ? ` Importe os PDFs para ver o resto: ${missingBooks.join(', ')}` : ''),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao restaurar backup');
    }
  }

  const folderBar = (layout: 'chips' | 'list') =>
    !!books?.length && <FolderBar kind="books" layout={layout} folders={folders} filter={filter} onFilter={setFilter} counts={folderCounts(books)} />;

  return (
    <HomeLayout active="books" aside={folderBar('list')}>
      <div
        className="min-h-full"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)]/90 px-4 py-3 backdrop-blur sm:px-6">
          <h1 className="mr-auto font-serif text-2xl font-bold">Estante</h1>
          {!!books?.length && (
            <label className="order-last flex h-10 w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--app-bg)] px-4 focus-within:border-amber-500 sm:order-none sm:w-64">
              <Search className="size-4 shrink-0 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Buscar na estante"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          )}
          <div className="relative">
            <button
              aria-label="Mais opções"
              aria-expanded={menuOpen}
              className="flex size-10 items-center justify-center rounded-full border border-[var(--border)] hover:bg-[var(--app-bg)]"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal className="size-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-12 right-0 z-20 w-72 overflow-hidden max-sm:fixed max-sm:top-16 max-sm:right-4 max-sm:left-4 max-sm:w-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 text-sm shadow-xl">
                  <div className="px-2.5 pt-1.5 pb-1 text-xs text-[var(--muted)]">Tema</div>
                  <div className="flex gap-1 px-1 pb-1.5">
                    {THEMES.map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => set({ theme: id })}
                        className={`flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-xs ${theme === id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)] hover:bg-[var(--app-bg)]'}`}
                      >
                        <Icon className="size-4" /> {label}
                      </button>
                    ))}
                  </div>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <BackupMenuSection onDone={() => setMenuOpen(false)} />
                  <button
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--app-bg)]"
                    onClick={() => {
                      setMenuOpen(false);
                      backupInput.current?.click();
                    }}
                  >
                    <Upload className="size-4" /> Restaurar backup
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            className="flex h-10 items-center gap-2 rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 hover:bg-amber-400"
            onClick={() => fileInput.current?.click()}
          >
            <FilePlus2 className="size-4" /> Adicionar livro
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_FILES}
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files ?? []);
              e.target.value = '';
            }}
          />
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleRestore(f);
              e.target.value = '';
            }}
          />
        </header>

        <div className="md:hidden">{folderBar('chips')}</div>

        <BackupReminder />

        {(busy || message) && (
          <div className="mx-4 mt-4 flex items-start justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm sm:mx-6">
            <span>{busy ?? message}</span>
            {!busy && (
              <button className="text-[var(--muted)]" onClick={() => setMessage(null)}>
                ✕
              </button>
            )}
          </div>
        )}

        <main className="p-4 sm:p-6">
          {books && books.length === 0 && (
            <button
              onClick={() => fileInput.current?.click()}
              className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] px-8 py-12 text-center text-[var(--muted)]"
            >
              <FilePlus2 className="size-10" />
              <span className="text-base font-medium text-[var(--app-fg)]">Sua estante está vazia</span>
              <span className="text-sm">Clique aqui ou arraste arquivos PDF ou EPUB para começar a ler.</span>
            </button>
          )}
          {books && books.length === 0 && (
            <p className="mt-4 text-center text-sm text-[var(--muted)]">
              Ou{' '}
              <a href="#/explorar" className="font-medium text-[var(--accent-text)] underline">
                busque livros gratuitos
              </a>{' '}
              em domínio público.
            </p>
          )}
          {!!books?.length && filter === null && !q && <ContinueReading books={books} />}
          {!!books?.length && (
            <div className="mb-4 flex items-center gap-3">
              <h2 className="mr-auto text-lg font-semibold">
                {q ? 'Resultados' : filter === null ? 'Todos os livros' : filter === '' ? 'Sem pasta' : (folders.find((f) => f.id === filter)?.name ?? '')}
              </h2>
              <select
                aria-label="Ordenar"
                value={librarySort}
                onChange={(e) => set({ librarySort: e.target.value as LibrarySort })}
                className="h-9 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 text-sm"
              >
                {SORTS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!!books?.length && q && shown?.length === 0 && <p className="mt-12 text-center text-sm text-[var(--muted)]">Nenhum livro com “{query.trim()}”.</p>}
          {!!books?.length && !q && shown?.length === 0 && (
            <p className="mt-12 text-center text-sm text-[var(--muted)]">
              {filter === '' ? 'Todos os livros estão em pastas.' : 'Nenhum livro nesta pasta. Use "Mover para" no menu de um livro, ou adicione um livro com a pasta aberta.'}
            </p>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
            {shown?.map((book) => <BookCard key={book.id} book={book} folders={folders} />)}
          </div>
        </main>

        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-amber-500/15 text-lg font-medium ring-4 ring-amber-500 ring-inset">
            Solte os livros para adicionar
          </div>
        )}
      </div>
    </HomeLayout>
  );
}
