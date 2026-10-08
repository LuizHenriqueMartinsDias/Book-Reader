import { MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { navigate } from '../../App';
import type { Book } from '../../db/schema';
import { deleteBook, updateBook } from '../../db/repo';

export default function BookCard({ book }: { book: Book }) {
  const [menu, setMenu] = useState(false);
  const epub = book.format === 'epub';
  const progress = epub ? (book.progress ?? 0) : book.pageCount > 1 ? (book.lastPage - 1) / (book.pageCount - 1) : 0;

  return (
    <div className="group relative">
      <button onClick={() => navigate(`#/read/${book.id}`)} className="block w-full text-left">
        <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-[var(--panel)] shadow-md ring-1 ring-black/5 transition group-hover:-translate-y-1 group-hover:shadow-lg">
          {epub && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">EPUB</span>}
          {book.coverThumb ? (
            <img src={book.coverThumb} alt="" className={`${epub ? '' : 'page-canvas'} size-full object-cover object-top`} />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-sm">
              <span className="font-medium">{book.title}</span>
              {book.author && <span className="text-xs text-[var(--muted)]">{book.author}</span>}
            </div>
          )}
        </div>
        <div className="mt-2 line-clamp-2 text-sm font-medium leading-snug" title={book.title}>
          {book.title}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--muted)]">
          <div className="h-1 flex-1 overflow-hidden rounded bg-[var(--border)]">
            <div className="h-full bg-amber-500" style={{ width: `${progress * 100}%` }} />
          </div>
          {!book.lastOpenedAt ? 'Novo' : epub ? `${Math.round(progress * 100)}%` : `${book.lastPage}/${book.pageCount}`}
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
          <div className="absolute top-8 right-1 z-20 w-36 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm shadow-lg">
            <button
              className="block w-full px-3 py-2 text-left hover:bg-[var(--app-bg)]"
              onClick={() => {
                setMenu(false);
                const title = prompt('Novo título', book.title)?.trim();
                if (title) updateBook(book.id, { title });
              }}
            >
              Renomear
            </button>
            <button
              className="block w-full px-3 py-2 text-left text-red-600 hover:bg-[var(--app-bg)]"
              onClick={() => {
                setMenu(false);
                if (confirm(`Excluir "${book.title}" e todas as suas anotações?`)) deleteBook(book.id);
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
