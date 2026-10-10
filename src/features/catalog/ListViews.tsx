import { Loader2, RotateCw } from 'lucide-react';
import { SOURCES } from '../../lib/catalog/browse';
import type { Source } from '../../lib/catalog/types';
import BookTile, { TileSkeleton } from './BookTile';
import CatalogHeader from './CatalogHeader';
import { useOnReach, useOnShelf, useScrollMemory } from './hooks';
import ResultCard, { SOURCE_LABEL } from './ResultCard';
import { catalogHref, type ListSpec, type SourceChoice } from './routes';
import { useCatalogSettings } from './settings';
import { useCatalogList } from './useCatalogList';

type List = ReturnType<typeof useCatalogList>;

/** Errors, the spinner, "nothing found" and loading more as the list scrolls to its end. */
function ListFooter({ list, empty }: { list: List; empty: string }) {
  const sentinel = useOnReach<HTMLDivElement>(list.loadMore, list.hasMore && !list.loading);
  return (
    <>
      {list.errors.map((e) => (
        <div key={e.source} className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          <span>
            {SOURCE_LABEL[e.source]}: {e.message}
          </span>
          <button onClick={list.loadMore} className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-500/30 px-2 py-1 hover:bg-red-500/10">
            <RotateCw className="size-3.5" /> Tentar de novo
          </button>
        </div>
      ))}
      {list.settled && !list.loading && !list.items.length && !list.errors.length && <p className="mt-10 text-center text-[var(--muted)]">{empty}</p>}
      {list.loading && !!list.items.length && <Loader2 className="mx-auto my-8 size-6 animate-spin text-[var(--muted)]" />}
      <div ref={sentinel} />
    </>
  );
}

/** Results of a search, from one catalog or both. */
export function SearchView({ query, source }: { query: string; source: SourceChoice }) {
  useScrollMemory(location.hash);
  const { language, openOnly } = useCatalogSettings();
  const sources: Source[] = source === 'all' ? ['gutenberg', 'archive'] : [source];
  const list = useCatalogList({ query }, sources, language, openOnly);
  const onShelf = useOnShelf();
  const choices: { id: SourceChoice; label: string; hint?: string }[] = [{ id: 'all', label: 'Tudo' }, ...SOURCES];

  return (
    <div className="min-h-full">
      <CatalogHeader key={query} query={query} />
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {choices.map((c) => (
            <a
              key={c.id}
              href={catalogHref.search(query, c.id)}
              title={c.hint}
              onClick={(e) => {
                // Switching the catalog replaces the results instead of adding a screen to go back through.
                e.preventDefault();
                location.replace(catalogHref.search(query, c.id));
              }}
              className={`rounded-full border px-3 py-1 ${source === c.id ? 'border-amber-500 bg-amber-500/10 font-medium' : 'border-[var(--border)] text-[var(--muted)]'}`}
            >
              {c.label}
            </a>
          ))}
        </div>
        <div className="mt-3 grid gap-3">
          {list.items.map((item) => (
            <ResultCard key={item.key} item={item} bookId={onShelf.get(item.key)} />
          ))}
          {!list.items.length && list.loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[8.5rem] animate-pulse rounded-xl bg-[var(--border)]" />)}
        </div>
        <ListFooter
          list={list}
          empty={`Nada encontrado para “${query}”.${openOnly ? ' Tente desmarcar o filtro de licença ou mudar o idioma.' : ' Tente outro idioma ou outras palavras.'}`}
        />
      </main>
    </div>
  );
}

/** Every book of a genre, shelf, author or subject, as a grid of covers. */
export function ListView({ list: spec }: { list: ListSpec | null }) {
  useScrollMemory(location.hash);
  const { language, openOnly } = useCatalogSettings();
  const list = useCatalogList(spec?.filter ?? {}, spec?.sources ?? [], language, openOnly);
  const onShelf = useOnShelf();
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]';

  return (
    <div className="min-h-full">
      <CatalogHeader />
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        {!spec ? (
          <p className="mt-10 text-center text-[var(--muted)]">Esta lista não existe mais.</p>
        ) : (
          <>
            {spec.subtitle && <p className="text-xs tracking-wide text-[var(--muted)] uppercase">{spec.subtitle}</p>}
            <h1 className="mb-5 font-serif text-2xl font-semibold">{spec.title}</h1>
            <div className={grid}>
              {list.items.map((item) => (
                <BookTile key={item.key} item={item} onShelf={onShelf.has(item.key)} />
              ))}
              {!list.items.length && list.loading && Array.from({ length: 12 }, (_, i) => <TileSkeleton key={i} />)}
            </div>
            <ListFooter list={list} empty="Nenhum livro encontrado neste idioma." />
          </>
        )}
      </main>
    </div>
  );
}
