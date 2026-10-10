import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { browseCached, remember } from '../../lib/catalog/browse';
import type { BrowseQuery, CatalogItem } from '../../lib/catalog/types';
import BookTile, { TileSkeleton } from './BookTile';
import { useNearViewport } from './hooks';

const TILE = 'w-28 shrink-0 snap-start sm:w-32';

type Load = { status: 'loading' } | { status: 'done'; items: CatalogItem[] } | { status: 'error'; message: string };

/** First page of a shelf (cached for a day), once `enabled` (it has come near the screen). */
export function useShelf(query: BrowseQuery, enabled = true) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setLoad({ status: 'loading' });
    browseCached(JSON.parse(key) as BrowseQuery)
      .then((page) => {
        remember(page.items);
        if (current) setLoad({ status: 'done', items: page.items });
      })
      .catch((e) => current && setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      current = false;
    };
  }, [enabled, key, attempt]);

  return { load, retry: () => setAttempt((n) => n + 1) };
}

/**
 * A titled row of covers that scrolls sideways, like a store front. Loads when it nears the
 * screen; hides itself when the catalog has nothing for it.
 */
export default function ShelfRow({
  title,
  subtitle,
  query,
  href,
  onShelf,
  exclude,
}: {
  title: string;
  subtitle?: string;
  query: BrowseQuery;
  /** "Ver tudo". */
  href?: string;
  onShelf: Map<string, string>;
  /** A book not to show (the one whose page this is). */
  exclude?: string;
}) {
  const [ref, near] = useNearViewport<HTMLElement>();
  const { load, retry } = useShelf(query, near);

  const items = load.status === 'done' ? load.items.filter((i) => i.key !== exclude) : [];
  if (load.status === 'done' && !items.length) return null;

  return (
    <section ref={ref} className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        {href && load.status === 'done' && (
          <a href={href} className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-[var(--accent-text)] hover:underline">
            Ver tudo <ChevronRight className="size-4" />
          </a>
        )}
      </div>
      {load.status === 'error' ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
          {navigator.onLine ? 'Não foi possível carregar.' : 'Sem conexão com a internet.'}
          <button onClick={retry} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1 hover:bg-[var(--panel)]">
            <RotateCw className="size-3.5" /> Tentar de novo
          </button>
        </div>
      ) : (
        <Scroller>
          {load.status === 'loading'
            ? Array.from({ length: 8 }, (_, i) => <TileSkeleton key={i} className={TILE} />)
            : items.map((item) => <BookTile key={item.key} item={item} onShelf={onShelf.has(item.key)} className={TILE} />)}
        </Scroller>
      )}
    </section>
  );
}

/** Sideways scrolling with arrow buttons for mouse users. */
export function Scroller({ children, className = 'gap-4' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  const arrow = 'absolute top-1/3 z-[1] hidden -translate-y-1/2 rounded-full border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-md group-hover/scroller:block [@media(hover:none)]:!hidden';
  return (
    <div className="group/scroller relative -mx-4 sm:-mx-6">
      <div ref={ref} className={`flex snap-x scroll-px-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 ${className}`}>
        {children}
      </div>
      <button aria-label="Anteriores" onClick={() => scroll(-1)} className={`${arrow} left-1`}>
        <ChevronLeft className="size-5" />
      </button>
      <button aria-label="Próximos" onClick={() => scroll(1)} className={`${arrow} right-1`}>
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
