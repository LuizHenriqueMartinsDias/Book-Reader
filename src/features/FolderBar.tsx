import { FolderPlus, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { createFolder, deleteFolder, FOLDER_COLORS, updateFolder, type FolderKind } from '../db/folders';
import type { Folder } from '../db/schema';

/** null = everything, '' = what isn't in a folder, else a folder id. */
export type FolderFilter = string | null;

export const inFolder = (folderId: string | null | undefined, filter: FolderFilter) =>
  filter === null || (filter === '' ? !folderId : folderId === filter);

/** Items per folder for the side menu: 'all', '' (no folder) and each folder id. */
export function folderCounts(items: { folderId?: string | null }[]) {
  const counts: Record<string, number> = { all: items.length, '': 0 };
  for (const { folderId } of items) counts[folderId ?? ''] = (counts[folderId ?? ''] ?? 0) + 1;
  return counts;
}

/** The folder picked on each screen, kept while the app is open (coming back from a book or notebook). */
const lastFilter: Record<FolderKind, FolderFilter> = { books: null, notebooks: null };
export function useFolderFilter(kind: FolderKind) {
  const [filter, setFilter] = useState<FolderFilter>(lastFilter[kind]);
  const set = (f: FolderFilter) => {
    lastFilter[kind] = f;
    setFilter(f);
  };
  return [filter, set] as const;
}

interface Props {
  kind: FolderKind;
  folders: Folder[];
  filter: FolderFilter;
  onFilter: (filter: FolderFilter) => void;
  /** `chips`: a row that scrolls sideways (phones); `list`: a column for the side menu. */
  layout?: 'chips' | 'list';
  /** How many items each filter holds, keyed by folder id ('all' for every item, '' for no folder). */
  counts?: Record<string, number>;
}

/** Folders to filter by, plus creating, renaming and deleting them. */
export default function FolderBar({ kind, folders, filter, onFilter, layout = 'chips', counts }: Props) {
  async function addFolder() {
    const name = prompt(kind === 'books' ? 'Nome da pasta (ex.: faculdade, romances)' : 'Nome da pasta (ex.: matéria)')?.trim();
    if (!name) return;
    const f = await createFolder(kind, name, FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
    onFilter(f.id);
  }

  const what = kind === 'books' ? 'os livros' : 'os cadernos';
  const editFolder = (folder: Folder) => {
    const action = prompt(`Pasta "${folder.name}": digite um novo nome, ou "excluir" para apagar a pasta (${what} ficam).`, folder.name)?.trim();
    if (!action) return;
    if (action.toLowerCase() === 'excluir') {
      deleteFolder(kind, folder.id);
      onFilter(null);
    } else updateFolder(kind, folder.id, { name: action });
  };
  const options = (folder: Folder) =>
    filter === folder.id && (
      <button className="ml-0.5 shrink-0 rounded-full p-1 text-[var(--muted)] hover:bg-[var(--app-bg)]" title="Opções da pasta" onClick={() => editFolder(folder)}>
        <MoreVertical className="size-3.5" />
      </button>
    );

  if (layout === 'list')
    return (
      <div className="flex flex-col gap-0.5">
        <div className="px-3 pt-6 pb-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Pastas</div>
        <ListItem active={filter === null} onClick={() => onFilter(null)} label="Todos" count={counts?.all} />
        {folders.map((folder) => (
          <div key={folder.id} className="flex items-center">
            <ListItem active={filter === folder.id} onClick={() => onFilter(folder.id)} label={folder.name} color={folder.color} count={counts?.[folder.id]} />
            {options(folder)}
          </div>
        ))}
        {folders.length > 0 && <ListItem active={filter === ''} onClick={() => onFilter('')} label="Sem pasta" count={counts?.['']} />}
        <button onClick={addFolder} className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-[var(--muted)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]">
          <FolderPlus className="size-4" /> Nova pasta
        </button>
      </div>
    );

  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 pt-4 pb-1 sm:px-6 [scrollbar-width:none]">
      <Chip active={filter === null} onClick={() => onFilter(null)} label="Todos" />
      {folders.map((folder) => (
        <div key={folder.id} className="flex shrink-0 items-center">
          <Chip active={filter === folder.id} onClick={() => onFilter(folder.id)} label={folder.name} color={folder.color} />
          {options(folder)}
        </div>
      ))}
      {folders.length > 0 && <Chip active={filter === ''} onClick={() => onFilter('')} label="Sem pasta" />}
      <button
        onClick={addFolder}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--app-fg)]"
      >
        <FolderPlus className="size-4" /> Pasta
      </button>
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

function ListItem({ active, onClick, label, color, count }: { active: boolean; onClick: () => void; label: string; color?: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left text-sm ${active ? 'bg-[var(--app-bg)] font-semibold' : 'hover:bg-[var(--app-bg)]'}`}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color ?? 'transparent' }} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-[var(--muted)] tabular-nums">{count}</span>}
    </button>
  );
}

/** "Move to" section of a card's menu; nothing when there are no folders yet. */
export function MoveToFolder({ folders, current, onMove }: { folders: Folder[]; current: string | null | undefined; onMove: (folderId: string | null) => void }) {
  if (!folders.length) return null;
  const options: { id: string | null; name: string; color?: string }[] = [{ id: null, name: 'Sem pasta' }, ...folders];
  return (
    <div className="border-t border-[var(--border)] py-1">
      <div className="px-3 py-1 text-xs text-[var(--muted)]">Mover para</div>
      {options.map((f) => (
        <button
          key={f.id ?? 'none'}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--app-bg)] ${(current ?? null) === f.id ? 'font-medium' : ''}`}
          onClick={() => onMove(f.id)}
        >
          {f.color && <span className="size-2.5 rounded-full" style={{ background: f.color }} />}
          {f.name}
        </button>
      ))}
    </div>
  );
}
