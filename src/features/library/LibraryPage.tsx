import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FilePlus2, Globe, Moon, Sun, SunDim, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { db } from '../../db/schema';
import { createBackup, download, restoreBackup } from '../../lib/backup';
import { useUi, type Theme } from '../../store/ui';
import FolderBar, { inFolder, useFolderFilter } from '../FolderBar';
import HomeTabs from '../HomeTabs';
import BookCard from './BookCard';
import { ACCEPTED_FILES, importBook, isBookFile } from './importBook';

const THEMES: { id: Theme; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Claro' },
  { id: 'sepia', icon: SunDim, label: 'Sépia' },
  { id: 'dark', icon: Moon, label: 'Escuro' },
];

export default function LibraryPage() {
  const books = useLiveQuery(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []);
  const folders = useLiveQuery(() => db.bookFolders.orderBy('order').toArray(), []) ?? [];
  const [filter, setFilter] = useFolderFilter('books');
  const shown = books?.filter((b) => inFolder(b.folderId, filter));
  const { theme, set } = useUi();
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

  return (
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
        <HomeTabs active="books" />
        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          {THEMES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              title={label}
              onClick={() => set({ theme: id })}
              className={`rounded-md p-1.5 ${theme === id ? 'bg-[var(--app-bg)]' : 'opacity-60 hover:opacity-100'}`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        <button
          title="Salvar backup das anotações"
          className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--app-bg)]"
          onClick={async () => download(await createBackup(), `book-reader-backup-${new Date().toISOString().slice(0, 10)}.json`)}
        >
          <Download className="size-4" />
        </button>
        <button
          title="Restaurar backup"
          className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--app-bg)]"
          onClick={() => backupInput.current?.click()}
        >
          <Upload className="size-4" />
        </button>
        <a
          href="#/explorar"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--app-bg)]"
        >
          <Globe className="size-4" /> Livros grátis
        </a>
        <button
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-stone-900 hover:bg-amber-400"
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

      {!!books?.length && <FolderBar kind="books" folders={folders} filter={filter} onFilter={setFilter} />}

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
        {!!books?.length && shown?.length === 0 && (
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
  );
}
