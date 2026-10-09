import { useLiveQuery } from 'dexie-react-hooks';
import { FileUp, FolderPlus, LayoutGrid, MoreVertical, Plus, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { createFolder, deleteFolder, deleteNotebook, FOLDER_COLORS, searchNotebooks, updateFolder, updateNotebook } from '../../db/notes';
import { db, type Folder, type Notebook } from '../../db/schema';
import { paperCss } from '../../lib/notes/render';
import HomeTabs from '../HomeTabs';
import { notebookFromPdf } from './importPdf';
import NewNotebookDialog from './NewNotebookDialog';

/** null = all notebooks, '' = notebooks without a folder. */
type FolderFilter = string | null;

export default function NotesHome() {
  const [filter, setFilter] = useState<FolderFilter>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray(), []) ?? [];
  const notebooks = useLiveQuery(() => searchNotebooks(query), [query]);
  const shown = notebooks?.filter((n) => filter === null || (filter === '' ? !n.folderId : n.folderId === filter));

  async function addFolder() {
    const name = prompt('Nome da pasta (ex.: matéria)')?.trim();
    if (!name) return;
    const f = await createFolder(name, FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
    setFilter(f.id);
  }

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

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)]/90 px-4 py-3 backdrop-blur sm:px-6">
        <HomeTabs active="notes" />
        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 focus-within:border-amber-500">
          <Search className="size-4 text-[var(--muted)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nos cadernos…" className="w-40 bg-transparent text-sm outline-none sm:w-56" />
        </label>
        <button className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--app-bg)]" onClick={() => pdfInput.current?.click()}>
          <FileUp className="size-4" /> Importar PDF
        </button>
        <button className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-stone-900 hover:bg-amber-400" onClick={() => setCreating(true)}>
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

      <div className="flex gap-1.5 overflow-x-auto px-4 pt-4 pb-1 sm:px-6 [scrollbar-width:none]">
        <Chip active={filter === null} onClick={() => setFilter(null)} label="Todos" />
        {folders.map((f) => (
          <FolderChip key={f.id} folder={f} active={filter === f.id} onClick={() => setFilter(f.id)} onDeleted={() => setFilter(null)} />
        ))}
        {folders.length > 0 && <Chip active={filter === ''} onClick={() => setFilter('')} label="Sem pasta" />}
        <button onClick={addFolder} className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--app-fg)]">
          <FolderPlus className="size-4" /> Pasta
        </button>
      </div>

      {busy && <p className="mx-4 mt-3 text-sm text-[var(--muted)] sm:mx-6">{busy}</p>}

      <main className="p-4 sm:p-6">
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
          {shown?.map((nb) => (
            <NotebookCard key={nb.id} notebook={nb} folders={folders} />
          ))}
        </div>
      </main>

      {creating && (
        <NewNotebookDialog folders={folders} folderId={filter || null} onClose={() => setCreating(false)} onCreated={(id) => navigate(`#/caderno/${id}`)} />
      )}
    </div>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${active ? 'border-amber-500 bg-amber-500/10 font-medium' : 'border-[var(--border)]'}`}
    >
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}

function FolderChip({ folder, active, onClick, onDeleted }: { folder: Folder; active: boolean; onClick: () => void; onDeleted: () => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <Chip active={active} onClick={onClick} label={folder.name} color={folder.color} />
      {active && (
        <button
          className="ml-0.5 rounded-full p-1 text-[var(--muted)] hover:bg-[var(--panel)]"
          title="Opções da pasta"
          onClick={() => {
            const action = prompt(`Pasta "${folder.name}": digite um novo nome, ou "excluir" para apagar a pasta (os cadernos ficam).`, folder.name)?.trim();
            if (!action) return;
            if (action.toLowerCase() === 'excluir') {
              deleteFolder(folder.id);
              onDeleted();
            } else updateFolder(folder.id, { name: action });
          }}
        >
          <MoreVertical className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function NotebookCard({ notebook, folders }: { notebook: Notebook; folders: Folder[] }) {
  const [menu, setMenu] = useState(false);
  const folder = folders.find((f) => f.id === notebook.folderId);
  return (
    <div className="group relative">
      <button onClick={() => navigate(`#/caderno/${notebook.id}`)} className="block w-full text-left">
        <div className="relative aspect-[3/4] overflow-hidden rounded-md shadow-md ring-1 ring-black/5 transition group-hover:-translate-y-1 group-hover:shadow-lg">
          {notebook.thumb ? (
            <img src={notebook.thumb} alt="" className="size-full object-cover object-top" />
          ) : (
            <div className="size-full" style={paperCss(notebook.paper, 0.35)} />
          )}
          <div className="absolute inset-y-0 left-0 w-2.5" style={{ background: notebook.coverColor }} />
          {notebook.kind === 'canvas' && (
            <span className="absolute right-1 bottom-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <LayoutGrid className="size-3" /> Quadro
            </span>
          )}
        </div>
        <div className="mt-2 line-clamp-2 text-sm font-medium leading-snug" title={notebook.title}>
          {notebook.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {folder && <span className="size-2 rounded-full" style={{ background: folder.color }} />}
          {new Date(notebook.updatedAt).toLocaleDateString('pt-BR')}
        </div>
      </button>
      <button
        aria-label="Opções"
        onClick={() => setMenu((m) => !m)}
        className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <MoreVertical className="size-4" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute top-8 right-1 z-20 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm shadow-lg">
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
            {folders.length > 0 && (
              <div className="border-t border-[var(--border)] py-1">
                <div className="px-3 py-1 text-xs text-[var(--muted)]">Mover para</div>
                {[{ id: null, name: 'Sem pasta', color: undefined } as { id: string | null; name: string; color?: string }, ...folders].map((f) => (
                  <button
                    key={f.id ?? 'none'}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--app-bg)] ${notebook.folderId === f.id || (!notebook.folderId && !f.id) ? 'font-medium' : ''}`}
                    onClick={() => {
                      setMenu(false);
                      updateNotebook(notebook.id, { folderId: f.id });
                    }}
                  >
                    {f.color && <span className="size-2.5 rounded-full" style={{ background: f.color }} />}
                    {f.name}
                  </button>
                ))}
              </div>
            )}
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
