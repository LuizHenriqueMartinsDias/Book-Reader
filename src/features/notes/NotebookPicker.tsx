import { useLiveQuery } from 'dexie-react-hooks';
import { LayoutGrid, Plus, X } from 'lucide-react';
import { COVER_COLORS, createNotebook } from '../../db/notes';
import { db } from '../../db/schema';

interface Props {
  title: string;
  onPick: (notebookId: string) => void;
  onClose: () => void;
}

/** Choose a notebook (most recent first), or start a new one. */
export default function NotebookPicker({ title, onPick, onClose }: Props) {
  const notebooks = useLiveQuery(() => db.notebooks.orderBy('updatedAt').reverse().toArray(), []);
  const folders = useLiveQuery(() => db.folders.toArray(), []);

  async function createAndPick() {
    const name = prompt('Nome do novo caderno')?.trim();
    if (!name) return;
    const nb = await createNotebook({ title: name, kind: 'paged', paper: { style: 'lined', color: '#ffffff' }, coverColor: COVER_COLORS[0] });
    onPick(nb.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-[var(--panel)] text-[var(--app-fg)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <ul className="overflow-y-auto p-2">
          <li>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-[var(--accent-text)] hover:bg-[var(--app-bg)]" onClick={createAndPick}>
              <span className="flex h-12 w-9 items-center justify-center rounded border-2 border-dashed border-current">
                <Plus className="size-4" />
              </span>
              <span className="text-sm font-medium">Novo caderno</span>
            </button>
          </li>
          {notebooks?.map((nb) => {
            const folder = folders?.find((f) => f.id === nb.folderId);
            return (
              <li key={nb.id}>
                <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-[var(--app-bg)]" onClick={() => onPick(nb.id)}>
                  <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-white shadow-sm ring-1 ring-black/10">
                    {nb.thumb && <img src={nb.thumb} alt="" className="size-full object-cover object-top" />}
                    <span className="absolute inset-y-0 left-0 w-1" style={{ background: nb.coverColor }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{nb.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      {nb.kind === 'canvas' && <LayoutGrid className="size-3" />}
                      {folder && (
                        <>
                          <span className="size-2 rounded-full" style={{ background: folder.color }} />
                          {folder.name} ·
                        </>
                      )}
                      {new Date(nb.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
