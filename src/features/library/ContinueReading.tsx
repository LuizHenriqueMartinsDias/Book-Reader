import { navigate } from '../../App';
import type { Book } from '../../db/schema';
import { BookCover, bookProgress, isFinished } from './BookCard';

/** Books opened and not finished, most recent first: the shelf's "pick up where you left off". */
export default function ContinueReading({ books }: { books: Book[] }) {
  const reading = books
    .filter((b) => b.lastOpenedAt > 0 && !isFinished(b))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, 3);
  if (!reading.length) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Continuar lendo</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {reading.map((book, i) => (
          <Card key={book.id} book={book} featured={i === 0} />
        ))}
      </div>
    </section>
  );
}

/** The last book read stands out (dark card); on phones the others shrink to half width. */
function Card({ book, featured }: { book: Book; featured: boolean }) {
  const progress = bookProgress(book);
  const where = book.format === 'epub' ? `${Math.round(progress * 100)}% lido` : `Página ${book.lastPage} de ${book.pageCount}`;
  return (
    <button
      onClick={() => navigate(`#/read/${book.id}`)}
      className={`flex min-w-0 gap-3 rounded-2xl p-3 text-left sm:gap-4 sm:p-4 ${
        featured ? 'col-span-2 bg-stone-900 text-white lg:col-span-1 dark:bg-stone-800' : 'border border-[var(--border)] bg-[var(--panel)]'
      }`}
    >
      <BookCover book={book} className={`aspect-[2/3] shrink-0 rounded shadow-md ${featured ? 'w-20' : 'w-10 lg:w-20'}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`line-clamp-2 font-serif leading-tight font-semibold ${featured ? 'text-lg' : 'text-sm lg:text-lg'}`}>{book.title}</span>
        {book.author && <span className={`truncate text-xs ${featured ? 'text-stone-300' : 'text-[var(--muted)]'} ${featured ? '' : 'max-lg:hidden'}`}>{book.author}</span>}
        <span className="mt-auto flex items-center gap-2 pt-1">
          <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${featured ? 'bg-stone-700' : 'bg-[var(--border)]'}`}>
            <span className="block h-full rounded-full bg-amber-500" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </span>
        </span>
        <span className={`text-xs ${featured ? 'text-stone-300' : 'text-[var(--muted)]'}`}>{where}</span>
      </span>
    </button>
  );
}
