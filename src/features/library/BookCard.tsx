import { MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { navigate } from '../../App';
import type { Book, Folder } from '../../db/schema';
import { deleteBook, getBookFile, updateBook } from '../../db/repo';
import { MoveToFolder } from '../FolderBar';
import { notebookFromPdf } from '../notes/importPdf';

/** How far into the book the reader is, 0 to 1. */
export const bookProgress = (book: Book) =>
  book.format === 'epub' ? (book.progress ?? 0) : book.pageCount > 1 ? (book.lastPage - 1) / (book.pageCount - 1) : 0;

/** Reached the end (EPUB positions rarely land on exactly 100%). */
export const isFinished = (book: Book) => !!book.lastOpenedAt && bookProgress(book) >= 0.99;

/** A book's cover (PDFs: their first page, which follows the theme's page filter), or its title. */
export function BookCover({ book, className = '' }: { book: Book; className?: string }) {
  const epub = book.format === 'epub';
  return book.coverThumb ? (
    <img src={book.coverThumb} alt="" className={`${epub ? '' : 'page-canvas'} bg-[var(--paper)] object-cover object-top ${className}`} />
  ) : (
    <div className={`flex items-center justify-center overflow-hidden bg-[var(--panel)] p-1 text-center font-serif text-[10px] text-[var(--app-fg)] ${className}`}>{book.title}</div>
  );
}

export default function BookCard({ book, folders }: { book: Book; folders: Folder[] }) {
  // Which side of the card the menu opens to: rightwards when the card is too near the left edge.
  const [menu, setMenu] = useState<false | 'left' | 'right'>(false);
  const epub = book.format === 'epub';
  const folder = folders.find((f) => f.id === book.folderId);
  const progress = bookProgress(book);

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
          {folder && <span className="size-2 shrink-0 rounded-full" style={{ background: folder.color }} title={folder.name} />}
          <div className="h-1 flex-1 overflow-hidden rounded bg-[var(--border)]">
            <div className={`h-full ${isFinished(book) ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${progress * 100}%` }} />
          </div>
          {!book.lastOpenedAt ? (
            <span className="font-semibold text-[var(--accent-text)]">Novo</span>
          ) : isFinished(book) ? (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Lido</span>
          ) : epub ? (
            `${Math.round(progress * 100)}%`
          ) : (
            `${book.lastPage}/${book.pageCount}`
          )}
        </div>
      </button>

      <button
        aria-label="Opções"
        onClick={(e) => {
          const right = e.currentTarget.getBoundingClientRect().right;
          setMenu((m) => (m ? false : right < 192 + 8 ? 'left' : 'right'));
        }}
        className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <MoreVertical className="size-4" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className={`absolute top-8 ${menu === 'left' ? 'left-1' : 'right-1'} z-20 w-48 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm shadow-lg`}>
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
            {!epub && (
              <button
                className="block w-full px-3 py-2 text-left hover:bg-[var(--app-bg)]"
                onClick={async () => {
                  setMenu(false);
                  const file = await getBookFile(book.id);
                  if (!file) return;
                  const nb = await notebookFromPdf(file, book.title, { sourceBookId: book.id });
                  navigate(`#/caderno/${nb.id}`);
                }}
              >
                Criar caderno deste PDF
              </button>
            )}
            <MoveToFolder
              folders={folders}
              current={book.folderId}
              onMove={(folderId) => {
                setMenu(false);
                updateBook(book.id, { folderId });
              }}
            />
            <button
              className="block w-full border-t border-[var(--border)] px-3 py-2 text-left text-red-600 hover:bg-[var(--app-bg)]"
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
