import { ExternalLink, Loader2, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadItem, recalled } from '../../lib/catalog/browse';
import { categoryOf } from '../../lib/catalog/shelves';
import type { BookFile, CatalogItem } from '../../lib/catalog/types';
import { formatBytes } from '../../lib/catalog/download';
import { Cover, toneOf } from './BookTile';
import CatalogHeader from './CatalogHeader';
import DownloadButton from './DownloadButton';
import { useOnShelf, useScrollMemory } from './hooks';
import { RIGHTS_STYLE, SOURCE_LABEL } from './ResultCard';
import { catalogHref } from './routes';
import { useCatalogSettings } from './settings';
import ShelfRow from './ShelfRow';

type Details = { item: CatalogItem; file?: BookFile | null };

const compactNumber = (n: number) => n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

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

  const file = details?.file;
  const stats = item
    ? [
        { label: 'formato', value: (file?.format ?? (item.source === 'gutenberg' ? 'epub' : null))?.toUpperCase() },
        { label: 'tamanho', value: file?.size ? formatBytes(file.size) : null },
        { label: 'downloads', value: item.downloads ? compactNumber(item.downloads) : null },
        { label: 'publicação', value: item.year ? String(item.year) : null },
      ].filter((s): s is { label: string; value: string } => !!s.value)
    : [];

  return (
    <div className="min-h-full">
      <CatalogHeader />
      {item && (
        // The book's own color (the one its plain cover would get), with the cover large in the middle.
        <div className="flex flex-col items-center gap-4 px-4 pt-8 pb-12 text-center text-white" style={{ background: toneOf(item.title) }}>
          <Cover item={item} className="aspect-[2/3] w-36 rounded-md shadow-2xl ring-1 ring-black/10 sm:w-44" />
          <div className="max-w-2xl">
            <h1 className="font-serif text-2xl leading-tight font-bold sm:text-3xl">{item.title}</h1>
            <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 text-[15px]">
              {item.authors ? (
                item.authors.split(';').map((a) => (
                  <a key={a} href={catalogHref.author(a.trim())} className="font-semibold text-amber-200 hover:underline">
                    {a.trim()}
                  </a>
                ))
              ) : (
                <span className="text-white/80">Autor desconhecido</span>
              )}
            </div>
          </div>
        </div>
      )}
      <main className={`mx-auto max-w-5xl px-4 pb-32 sm:px-6 md:pb-10 ${item ? '' : 'pt-4'}`}>
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
            {!!stats.length && (
              <div className="relative mx-auto -mt-7 grid max-w-xl rounded-2xl bg-[var(--panel)] py-3 shadow-md" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
                {stats.map((s, i) => (
                  <div key={s.label} className={`flex flex-col items-center gap-0.5 px-1 ${i ? 'border-l border-[var(--border)]' : ''}`}>
                    <span className="text-[15px] font-semibold tabular-nums">{s.value}</span>
                    <span className="text-xs text-[var(--muted)]">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-semibold ${RIGHTS_STYLE[item.rights.kind]}`}>{item.rights.label}</span>
              <span className="rounded-full bg-[var(--border)] px-2.5 py-1 font-semibold">{SOURCE_LABEL[item.source]}</span>
            </div>
            <div className="mt-5 hidden items-center justify-center gap-4 md:flex">
              <Actions item={item} details={details} bookId={onShelf.get(item.key)} />
            </div>
            {/* Phones: the download sits at the bottom of the screen, in reach. */}
            <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-[var(--border)] bg-[var(--panel)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
              <div className="min-w-0 flex-1">
                <DownloadButton item={item} bookId={onShelf.get(item.key)} file={details.file} large />
              </div>
              <a
                href={item.pageUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ver no ${SOURCE_LABEL[item.source]}`}
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)]"
              >
                <ExternalLink className="size-5" />
              </a>
            </div>

            {summary && (
              <section className="mx-auto mt-8 max-w-3xl">
                <h2 className="mb-2 text-lg font-semibold">Sobre este livro</h2>
                <p className={`font-serif text-[15px] leading-relaxed whitespace-pre-line ${long && !expanded ? 'line-clamp-6' : ''}`}>{summary}</p>
                {long && (
                  <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm font-medium text-[var(--accent-text)] hover:underline">
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
