import { featuredAuthors, homeShelves, type Shelf } from '../../lib/catalog/shelves';
import HomeLayout from '../HomeLayout';
import CatalogHeader from './CatalogHeader';
import { useOnShelf, useScrollMemory } from './hooks';
import { GenreGrid, RankList, WeeklyPick } from './HomeSections';
import { catalogHref } from './routes';
import { useCatalogSettings } from './settings';
import ShelfRow, { Scroller } from './ShelfRow';

const chip = 'shrink-0 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 py-1.5 text-sm whitespace-nowrap hover:border-amber-500';

const shelfHref = (shelf: Shelf) => (shelf.id.startsWith('categoria:') ? catalogHref.category(shelf.id.slice('categoria:'.length)) : catalogHref.shelf(shelf.id));

/** The catalog's front page: the book of the week, genres, authors, the most downloaded and shelves to browse. */
export default function HomeView() {
  useScrollMemory(location.hash);
  const { language, openOnly } = useCatalogSettings();
  const onShelf = useOnShelf();
  const shelves = homeShelves(language);
  // The most downloaded books: the chart, and where the book of the week is picked from.
  const popularShelf = shelves.find((s) => s.id === 'populares')!;
  const popular = { ...popularShelf.filter, source: popularShelf.source, language, openOnly };

  return (
    <HomeLayout active="catalog">
      <div className="min-h-full">
        <CatalogHeader home />
        <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
          <WeeklyPick query={popular} onShelf={onShelf} />
          <GenreGrid />

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Autores</h2>
            <Scroller className="gap-2">
              {featuredAuthors(language).map((a) => (
                <a key={a} href={catalogHref.author(a)} className={chip}>
                  {a}
                </a>
              ))}
            </Scroller>
          </section>

          <RankList title="Mais baixados" subtitle="Project Gutenberg" query={popular} href={catalogHref.shelf('populares')} onShelf={onShelf} />

          {shelves.filter((shelf) => shelf.id !== 'populares').map((shelf) => (
            <ShelfRow
              key={`${shelf.id}|${language}|${openOnly}`}
              title={shelf.title}
              subtitle={shelf.subtitle}
              query={{ ...shelf.filter, source: shelf.source, language, openOnly }}
              href={shelfHref(shelf)}
              onShelf={onShelf}
            />
          ))}

          <p className="mt-10 text-center text-xs text-[var(--muted)]">
            Livros do Project Gutenberg (gutenberg.org) e do Internet Archive (archive.org). Respeite os direitos autorais: itens marcados “Verifique os
            direitos” podem não estar liberados no seu país.
          </p>
        </main>
      </div>
    </HomeLayout>
  );
}
