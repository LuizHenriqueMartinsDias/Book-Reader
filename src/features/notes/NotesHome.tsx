import { useLiveQuery } from 'dexie-react-hooks';
import { Columns2, FileUp, LayoutGrid, MoreVertical, Plus, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { deleteNotebook, searchNotebooks, updateNotebook } from '../../db/notes';
import { db, type Folder, type Notebook } from '../../db/schema';
import { paperCss } from '../../lib/notes/render';
import { useUi } from '../../store/ui';
import FolderBar, { folderCounts, inFolder, MoveToFolder, useFolderFilter } from '../FolderBar';
import HomeLayout from '../HomeLayout';
import { notebookFromPdf } from './importPdf';
import NewNotebookDialog from './NewNotebookDialog';

export default function NotesHome() {
  const [filter, setFilter] = useFolderFilter('notebooks');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray(), []) ?? [];
  const notebooks = useLiveQuery(() => searchNotebooks(query), [query]);
  const shown = notebooks?.filter((n) => inFolder(n.folderId, filter));
  // Edited this week (searchNotebooks lists the latest first); a short row above everything.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = (notebooks ?? []).filter((n) => n.updatedAt > weekAgo).slice(0, 6);

  async function importPdf(file: File) {
    setBusy(`Importando ${file.name}…`);
    try {
      const nb = await notebookFromPdf(file, file.name.replace(/\.pdf$/i, ''), { folderId: filter || null });
      navigate(`#/caderno/${nb.id}`);
    } catch (e) {
      alert(`Não foi possível importar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  const allNotebooks = useLiveQuery(() => db.notebooks.toArray(), []) ?? [];
  const folderBar = (layout: 'chips' | 'list') => (
    <FolderBar kind="notebooks" layout={layout} folders={folders} filter={filter} onFilter={setFilter} counts={folderCounts(allNotebooks)} />
  );

  return (
    <HomeLayout active="notes" aside={folderBar('list')}>
      <div className="min-h-full">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)]/90 px-4 py-3 backdrop-blur sm:px-6">
          <h1 className="mr-auto font-serif text-2xl font-bold">Cadernos</h1>
          <label className="order-last flex h-10 w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--app-bg)] px-4 focus-within:border-amber-500 sm:order-none sm:w-64">
            <Search className="size-4 shrink-0 text-[var(--muted)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Buscar nos cadernos" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <button
            className="flex h-10 items-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm hover:bg-[var(--app-bg)]"
            title="Importar PDF para escrever por cima"
            onClick={() => pdfInput.current?.click()}
          >
            <FileUp className="size-4" /> <span className="max-sm:hidden">Importar PDF</span>
          </button>
          <button className="flex h-10 items-center gap-2 rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 hover:bg-amber-400" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Novo caderno
          </button>
          <input
            ref={pdfInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importPdf(f);
              e.target.value = '';
            }}
          />
        </header>

        <div className="md:hidden">{folderBar('chips')}</div>

        {busy && <p className="mx-4 mt-3 text-sm text-[var(--muted)] sm:mx-6">{busy}</p>}

        <main className="p-4 sm:p-6">
          {!query && filter === null && <ResumeSplit />}
          {!query && filter === null && !!recent.length && (shown?.length ?? 0) > recent.length && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">
                Recentes <span className="text-sm font-normal text-[var(--muted)]">editados nos últimos 7 dias</span>
              </h2>
              <div className={grid}>
                {recent.map((nb) => (
                  <NotebookCard key={nb.id} notebook={nb} folders={folders} />
                ))}
              </div>
            </section>
          )}
          {!!shown?.length && (
            <h2 className="mb-3 text-lg font-semibold">
              {query ? 'Resultados' : filter === null ? 'Todos os cadernos' : filter === '' ? 'Sem pasta' : (folders.find((f) => f.id === filter)?.name ?? '')}
            </h2>
          )}
          {shown?.length === 0 && (
            <button
              onClick={() => setCreating(true)}
              className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] px-8 py-12 text-center text-[var(--muted)]"
            >
              <Plus className="size-10" />
              <span className="text-base font-medium text-[var(--app-fg)]">{query ? 'Nada encontrado' : 'Nenhum caderno aqui'}</span>
              <span className="text-sm">Crie um caderno com páginas ou uma tela infinita, ou importe um PDF para escrever por cima.</span>
            </button>
          )}
          <div className={grid}>
            {shown?.map((nb) => (
              <NotebookCard key={nb.id} notebook={nb} folders={folders} />
            ))}
          </div>
        </main>

        {creating && (
          <NewNotebookDialog folders={folders} folderId={filter || null} onClose={() => setCreating(false)} onCreated={(id) => navigate(`#/caderno/${id}`)} />
        )}
      </div>
    </HomeLayout>
  );
}

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-8';

/** "Study side by side": reopens the last book and notebook used together, when both still exist. */
function ResumeSplit() {
  const last = useUi((s) => s.lastSplit);
  const pair = useLiveQuery(
    async () => (last ? { book: await db.books.get(last.bookId), notebook: await db.notebooks.get(last.notebookId) } : null),
    [last?.bookId, last?.notebookId],
  );
  if (!last || !pair?.book || !pair.notebook) return null;
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-[var(--accent-text)]">
        <Columns2 className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Estudar lado a lado</span>
        <span className="block truncate text-sm text-[var(--muted)]">
          <b className="font-semibold text-[var(--app-fg)]">{pair.book.title}</b> + <b className="font-semibold text-[var(--app-fg)]">{pair.notebook.title}</b>
        </span>
      </span>
      <a
        href={`#/read/${last.bookId}?caderno=${last.notebookId}`}
        className="flex h-10 items-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
      >
        Retomar
      </a>
    </div>
  );
}

function NotebookCard({ notebook, folders }: { notebook: Notebook; folders: Folder[] }) {
  // Which side of the card the menu opens to: rightwards when the card is too near the left edge.
  const [menu, setMenu] = useState<false | 'left' | 'right'>(false);
  const folder = folders.find((f) => f.id === notebook.folderId);
  return (
    <div className="group relative">
      <button onClick={() => navigate(`#/caderno/${notebook.id}`)} className="block w-full text-left">
        <div className="relative aspect-[3/4] overflow-hidden rounded-l-sm rounded-r-lg shadow-md ring-1 ring-black/5 transition group-hover:-translate-y-1 group-hover:shadow-lg">
          {notebook.thumb ? (
            <img src={notebook.thumb} alt="" className="size-full object-cover object-top" />
          ) : (
            <div className="size-full" style={paperCss(notebook.paper, 0.35)} />
          )}
          {/* The spine, with a fold where it meets the cover. */}
          <div className="absolute inset-y-0 left-0 w-3.5 shadow-[inset_-3px_0_4px_rgba(0,0,0,0.18)]" style={{ background: notebook.coverColor }} />
          {notebook.kind === 'canvas' && (
            <span className="absolute right-1 bottom-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <LayoutGrid className="size-3" /> Quadro
            </span>
          )}
        </div>
        <div className="mt-2 line-clamp-2 text-sm leading-snug font-semibold" title={notebook.title}>
          {notebook.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {folder && <span className="size-2 rounded-full" style={{ background: folder.color }} />}
          {new Date(notebook.updatedAt).toLocaleDateString('pt-BR')}
        </div>
      </button>
      <button
        aria-label="Opções"
        onClick={(e) => {
          const right = e.currentTarget.getBoundingClientRect().right;
          setMenu((m) => (m ? false : right < 176 + 8 ? 'left' : 'right'));
        }}
        className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <MoreVertical className="size-4" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className={`absolute top-8 ${menu === 'left' ? 'left-1' : 'right-1'} z-20 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm shadow-lg`}>
            <button
              className="block w-full px-3 py-2 text-left hover:bg-[var(--app-bg)]"
              onClick={() => {
                setMenu(false);
                const title = prompt('Novo nome', notebook.title)?.trim();
                if (title) updateNotebook(notebook.id, { title });
              }}
            >
              Renomear
            </button>
            <MoveToFolder
              folders={folders}
              current={notebook.folderId}
              onMove={(folderId) => {
                setMenu(false);
                updateNotebook(notebook.id, { folderId });
              }}
            />
            <button
              className="block w-full border-t border-[var(--border)] px-3 py-2 text-left text-red-600 hover:bg-[var(--app-bg)]"
              onClick={() => {
                setMenu(false);
                if (confirm(`Excluir o caderno "${notebook.title}"? Isso não pode ser desfeito.`)) deleteNotebook(notebook.id);
              }}
            >
              Excluir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
