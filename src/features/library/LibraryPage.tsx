import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Download, FilePlus2, Moon, Sun, SunDim, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { db } from '../../db/schema';
import { createBackup, download, restoreBackup } from '../../lib/backup';
import { useUi, type Theme } from '../../store/ui';
import BookCard from './BookCard';
import { importBook } from './importBook';

const THEMES: { id: Theme; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Claro' },
  { id: 'sepia', icon: SunDim, label: 'Sépia' },
  { id: 'dark', icon: Moon, label: 'Escuro' },
];

export default function LibraryPage() {
  const books = useLiveQuery(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []);
  const { theme, set } = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  async function handleFiles(files: Iterable<File>) {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return setMessage('Nenhum PDF encontrado.');
    const results = [];
    for (const [i, file] of pdfs.entries()) {
      setBusy(`Importando ${i + 1}/${pdfs.length}: ${file.name}`);
      results.push(await importBook(file));
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
      const { annotations, missingBooks } = await restoreBackup(file);
      setMessage(
        `${annotations} anotações restauradas.` +
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
        <BookOpen className="size-6" />
        <h1 className="mr-auto text-lg font-semibold">Minha estante</h1>
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
        <button
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-stone-900 hover:bg-amber-400"
          onClick={() => fileInput.current?.click()}
        >
          <FilePlus2 className="size-4" /> Adicionar PDF
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
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
            <span className="text-sm">Clique aqui ou arraste arquivos PDF para começar a ler.</span>
          </button>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
          {books?.map((book) => <BookCard key={book.id} book={book} />)}
        </div>
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-amber-500/15 text-lg font-medium ring-4 ring-amber-500 ring-inset">
          Solte os PDFs para adicionar
        </div>
      )}
    </div>
  );
}
