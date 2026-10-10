import { ExternalLink, Loader2, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadItem, recalled } from '../../lib/catalog/browse';
import { categoryOf } from '../../lib/catalog/shelves';
import type { BookFile, CatalogItem } from '../../lib/catalog/types';
import { Cover } from './BookTile';
import CatalogHeader from './CatalogHeader';
import DownloadButton from './DownloadButton';
import { useOnShelf, useScrollMemory } from './hooks';
import { RIGHTS_STYLE, SOURCE_LABEL } from './ResultCard';
import { catalogHref } from './routes';
import { useCatalogSettings } from './settings';
import ShelfRow from './ShelfRow';

type Details = { item: CatalogItem; file?: BookFile | null };

/** A book's page: cover, details, summary, download, and more by the author and on the subject. */
export default function BookView({ itemKey }: { itemKey: string }) {
  useScrollMemory(location.hash);
  const { language, openOnly } = useCatalogSettings();
  const onShelf = useOnShelf();
  // Books seen in a list show at once; the full record (Archive description, file size) fills in.
  const [details, setDetails] = useState<Details | null>(() => {
    const item = recalled(itemKey);
    return item ? { item } : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    loadItem(itemKey, ctrl.signal)
      .then(setDetails)
      .catch((e) => !ctrl.signal.aborted && setError(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : 'Sem conexão com a internet.'));
    return () => ctrl.abort();
  }, [itemKey, attempt]);

  const item = details?.item;
  const author = item?.authors.split(';')[0]?.trim();
  const summary = item?.summary ?? '';
  // "More like this": the book's genre when its subjects name one, else its first subject.
  const genre = categoryOf(item?.subjects ?? []);
  const topic = item?.subjects?.[0];
  const similar = genre
    ? { title: `Mais em ${genre.label}`, subject: genre.subject, href: catalogHref.category(genre.id) }
    : topic && { title: `Mais em “${topic}”`, subject: { gutenberg: topic, archive: [topic] }, href: catalogHref.subject(topic) };
  const long = summary.length > 420;

  return (
    <div className="min-h-full">
      <CatalogHeader />
      <main className="mx-auto max-w-5xl p-4 pb-10 sm:p-6">
        {!item ? (
          error ? (
            <div className="mt-10 flex flex-col items-center gap-3 text-center text-[var(--muted)]">
              {error}
              <button onClick={() => setAttempt((n) => n + 1)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
                <RotateCw className="size-4" /> Tentar de novo
              </button>
            </div>
          ) : (
            <Loader2 className="mx-auto mt-16 size-6 animate-spin text-[var(--muted)]" />
          )
        ) : (
          <>
            <div className="flex gap-4 sm:gap-6">
              <Cover item={item} className="aspect-[2/3] w-28 shrink-0 rounded-md shadow-lg ring-1 ring-black/5 sm:w-44" />
              <div className="flex min-w-0 flex-1 flex-col">
                <h1 className="text-xl leading-tight font-semibold sm:text-3xl">{item.title}</h1>
                <div className="mt-1.5 flex flex-wrap gap-x-2 text-sm">
                  {item.authors ? (
                    item.authors.split(';').map((a) => (
                      <a key={a} href={catalogHref.author(a.trim())} className="font-medium text-amber-600 hover:underline">
                        {a.trim()}
                      </a>
                    ))
                  ) : (
                    <span className="text-[var(--muted)]">Autor desconhecido</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${RIGHTS_STYLE[item.rights.kind]}`}>{item.rights.label}</span>
                  {item.year && <span>{item.year}</span>}
                  <span>{SOURCE_LABEL[item.source]}</span>
                  {!!item.downloads && <span>· {item.downloads.toLocaleString('pt-BR')} downloads</span>}
                </div>
                <div className="mt-auto hidden flex-wrap items-center gap-3 pt-4 sm:flex">
                  <Actions item={item} details={details} bookId={onShelf.get(item.key)} />
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:hidden">
              <Actions item={item} details={details} bookId={onShelf.get(item.key)} />
            </div>

            {summary && (
              <section className="mt-8 max-w-3xl">
                <h2 className="mb-2 text-lg font-semibold">Sobre este livro</h2>
                <p className={`text-sm leading-relaxed whitespace-pre-line ${long && !expanded ? 'line-clamp-6' : ''}`}>{summary}</p>
                {long && (
                  <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm font-medium text-amber-600 hover:underline">
                    {expanded ? 'Mostrar menos' : 'Mostrar mais'}
                  </button>
                )}
                {item.source === 'gutenberg' && <p className="mt-2 text-xs text-[var(--muted)]">Resumo gerado automaticamente pelo Project Gutenberg.</p>}
              </section>
            )}

            {!!item.subjects?.length && (
              <section className="mt-6">
                <h2 className="mb-2 text-sm text-[var(--muted)]">Assuntos</h2>
                <div className="flex flex-wrap gap-2">
                  {item.subjects.map((s) => (
                    <a
                      key={s}
                      href={catalogHref.subject(s)}
                      className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm hover:border-amber-500"
                    >
                      {s}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {author && (
              <ShelfRow
                key={`autor|${author}`}
                title={`Mais de ${author}`}
                query={{ authors: [author], source: item.source, language, openOnly }}
                href={catalogHref.author(author)}
                onShelf={onShelf}
                exclude={item.key}
              />
            )}
            {similar && (
              <ShelfRow
                key={`similar|${similar.href}`}
                title={similar.title}
                query={{ subject: similar.subject, source: item.source, language, openOnly }}
                href={similar.href}
                onShelf={onShelf}
                exclude={item.key}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Actions({ item, details, bookId }: { item: CatalogItem; details: Details; bookId?: string }) {
  return (
    <>
      <div className="sm:min-w-56">
        {/* `file` is known once the full record has loaded (always, for Gutenberg). */}
        <DownloadButton item={item} bookId={bookId} file={details.file} large />
      </div>
      <a href={item.pageUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-sm text-[var(--muted)] hover:underline">
        <ExternalLink className="size-4" /> Ver no {SOURCE_LABEL[item.source]}
      </a>
    </>
  );
}
