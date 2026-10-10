import { Clock, X } from 'lucide-react';
import { CATEGORIES, featuredAuthors, homeShelves, type Shelf } from '../../lib/catalog/shelves';
import HomeLayout from '../HomeLayout';
import CatalogHeader from './CatalogHeader';
import { useOnShelf, useScrollMemory } from './hooks';
import { catalogHref } from './routes';
import { useCatalogSettings } from './settings';
import ShelfRow, { Scroller } from './ShelfRow';

const chip = 'shrink-0 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 py-1.5 text-sm whitespace-nowrap hover:border-amber-500';

const shelfHref = (shelf: Shelf) => (shelf.id.startsWith('categoria:') ? catalogHref.category(shelf.id.slice('categoria:'.length)) : catalogHref.shelf(shelf.id));

/** The catalog's front page: genres, authors and shelves of books to browse. */
export default function HomeView() {
  useScrollMemory(location.hash);
  const { language, openOnly, recentSearches, clearRecent } = useCatalogSettings();
  const onShelf = useOnShelf();

  return (
    <HomeLayout active="catalog">
      <div className="min-h-full">
        <CatalogHeader home />
        <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
          {!!recentSearches.length && (
            <section className="mt-5">
              <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
                <span>Buscas recentes</span>
                <button onClick={clearRecent} className="flex items-center gap-1 hover:text-[var(--app-fg)]">
                  <X className="size-3.5" /> Limpar
                </button>
              </div>
              <Scroller className="gap-2">
                {recentSearches.map((q) => (
                  <a key={q} href={catalogHref.search(q)} className={`${chip} flex items-center gap-1.5`}>
                    <Clock className="size-3.5 text-[var(--muted)]" /> {q}
                  </a>
                ))}
              </Scroller>
            </section>
          )}

          <section className="mt-5">
            <h2 className="mb-2 text-sm text-[var(--muted)]">Gêneros</h2>
            <Scroller className="gap-2">
              {CATEGORIES.map((c) => (
                <a key={c.id} href={catalogHref.category(c.id)} className={chip}>
                  {c.label}
                </a>
              ))}
            </Scroller>
          </section>

          <section className="mt-4">
            <h2 className="mb-2 text-sm text-[var(--muted)]">Autores</h2>
            <Scroller className="gap-2">
              {featuredAuthors(language).map((a) => (
                <a key={a} href={catalogHref.author(a)} className={chip}>
                  {a}
                </a>
              ))}
            </Scroller>
          </section>

          {homeShelves(language).map((shelf) => (
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
