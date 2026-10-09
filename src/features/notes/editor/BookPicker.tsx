import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '../../../db/schema';

/** Choose a book from the library (to open it next to a notebook). */
export default function BookPicker({ onPick, onClose }: { onPick: (bookId: string) => void; onClose: () => void }) {
  const books = useLiveQuery(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-[var(--panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-semibold">Abrir livro ao lado</h2>
          <button className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <ul className="overflow-y-auto p-2">
          {books?.length === 0 && <li className="p-4 text-center text-sm text-[var(--muted)]">Nenhum livro na estante.</li>}
          {books?.map((b) => (
            <li key={b.id}>
              <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-[var(--app-bg)]" onClick={() => onPick(b.id)}>
                {b.coverThumb ? <img src={b.coverThumb} alt="" className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-[var(--app-bg)]" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="text-xs text-[var(--muted)]">{b.format === 'epub' ? 'EPUB' : `${b.pageCount} páginas`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
