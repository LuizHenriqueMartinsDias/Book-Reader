import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadItem } from '../../lib/catalog/browse';
import { CATEGORIES } from '../../lib/catalog/shelves';
import type { BrowseQuery, CatalogItem } from '../../lib/catalog/types';
import { Cover } from './BookTile';
import DownloadButton from './DownloadButton';
import { catalogHref } from './routes';
import { useShelf } from './ShelfRow';

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** First sentence of a summary, for a one-line pitch. */
const firstSentence = (text: string) => text.match(/^.+?[.!?](\s|$)/)?.[0].trim() ?? text;

/**
 * "Book of the week": one of the most downloaded books, the same for everyone all week, with
 * the opening of its summary (fetched from its own page).
 */
export function WeeklyPick({ query, onShelf }: { query: BrowseQuery; onShelf: Map<string, string> }) {
  const { load } = useShelf(query);
  const candidates = load.status === 'done' ? load.items.filter((i) => i.authors).slice(0, 12) : [];
  const pick: CatalogItem | undefined = candidates[Math.floor(Date.now() / WEEK) % Math.max(1, candidates.length)];
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    if (!pick) return;
    const ctrl = new AbortController();
    loadItem(pick.key, ctrl.signal)
      .then(({ item }) => item.summary && setSummary(firstSentence(item.summary)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [pick?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (load.status === 'error' || (load.status === 'done' && !pick)) return null;
  if (!pick) return <div className="mt-5 h-44 animate-pulse rounded-2xl bg-[var(--border)] sm:h-52" />;

  return (
    <section className="mt-5 flex gap-4 rounded-2xl bg-amber-100 p-4 sm:gap-6 sm:p-6 dark:bg-amber-500/10">
      <a href={catalogHref.book(pick.key)} className="shrink-0">
        <Cover item={pick} className="aspect-[2/3] w-24 rounded-md shadow-lg sm:w-32" />
      </a>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wider text-[var(--accent-text)] uppercase">Clássico da semana</span>
        <a href={catalogHref.book(pick.key)} className="line-clamp-2 font-serif text-xl leading-tight font-bold hover:underline sm:text-2xl">
          {pick.title}
        </a>
        <span className="truncate text-sm text-[var(--muted)]">{pick.authors}</span>
        {summary && <p className="line-clamp-3 text-sm text-[var(--app-fg)]/80 max-sm:hidden">{summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          <DownloadButton item={pick} bookId={onShelf.get(pick.key)} />
          <a href={catalogHref.book(pick.key)} className="text-sm font-medium text-[var(--accent-text)] hover:underline">
            Ver detalhes
          </a>
        </div>
      </div>
    </section>
  );
}

// Dark tones, so white names read on all of them.
const GENRE_COLORS = ['#9f1239', '#075985', '#065f46', '#5b21b6', '#9a3412', '#1e3a8a', '#0f766e', '#86198f', '#3f6212', '#44403c', '#7c2d12', '#155e75', '#4c1d95'];

const PHONE_GENRES = 6;

/** Genres as colored tiles; phones show the first few until asked for more. */
export function GenreGrid() {
  const [all, setAll] = useState(false);
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Gêneros</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((c, i) => (
          <a
            key={c.id}
            href={catalogHref.category(c.id)}
            className={`flex h-14 items-end rounded-xl px-3.5 pb-2.5 font-serif text-base font-semibold text-white transition hover:brightness-110 sm:h-16 ${
              i >= PHONE_GENRES && !all ? 'max-sm:hidden' : ''
            }`}
            style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }}
          >
            {c.label}
          </a>
        ))}
      </div>
      <button onClick={() => setAll((a) => !a)} className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] text-sm font-medium sm:hidden">
        {all ? 'Menos gêneros' : `Mais gêneros (${CATEGORIES.length - PHONE_GENRES})`}
      </button>
    </section>
  );
}

/** The most downloaded books as a numbered chart, each with its download button. */
export function RankList({ title, subtitle, query, href, onShelf }: { title: string; subtitle?: string; query: BrowseQuery; href: string; onShelf: Map<string, string> }) {
  const { load, retry } = useShelf(query);
  const items = load.status === 'done' ? load.items.slice(0, 10) : [];
  if (load.status === 'done' && !items.length) return null;

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        <a href={href} className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-[var(--accent-text)] hover:underline">
          Ver ranking <ChevronRight className="size-4" />
        </a>
      </div>
      {load.status === 'error' ? (
        <button onClick={retry} className="w-full rounded-xl border border-dashed border-[var(--border)] py-8 text-sm text-[var(--muted)]">
          Não foi possível carregar. Tentar de novo
        </button>
      ) : (
        <ol className="grid gap-x-8 md:grid-cols-2">
          {(load.status === 'loading' ? Array.from({ length: 6 }, () => null) : items).map((item, i) => (
            // On phones the chart stops at five.
            <li key={item?.key ?? i} className={`flex items-center gap-3 py-2 ${i >= 5 ? 'max-md:hidden' : ''}`}>
              <span className="w-6 shrink-0 text-center font-serif text-lg font-bold text-[var(--muted)]">{i + 1}</span>
              {item ? (
                <>
                  <a href={catalogHref.book(item.key)} className="shrink-0">
                    <Cover item={item} className="aspect-[2/3] w-11 rounded shadow-sm" />
                  </a>
                  <a href={catalogHref.book(item.key)} className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[15px] font-semibold">{item.title}</span>
                    <span className="line-clamp-1 text-sm text-[var(--muted)]">{item.authors || 'Autor desconhecido'}</span>
                  </a>
                  <DownloadButton item={item} bookId={onShelf.get(item.key)} icon />
                </>
              ) : (
                <span className="h-16 flex-1 animate-pulse rounded-lg bg-[var(--border)]" />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
