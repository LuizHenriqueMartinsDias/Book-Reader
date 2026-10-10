import type { CatalogItem } from '../../lib/catalog/types';
import { Cover } from './BookTile';
import DownloadButton from './DownloadButton';
import { catalogHref } from './routes';

export const RIGHTS_STYLE = {
  'public-domain': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'open-license': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  unknown: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export const SOURCE_LABEL = { gutenberg: 'Gutenberg', archive: 'Internet Archive' };

/** A search result: tap it for the book's page, or download it right here. */
export default function ResultCard({ item, bookId }: { item: CatalogItem; bookId?: string }) {
  const { rights, year, title } = item;
  const href = catalogHref.book(item.key);

  return (
    <article className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
      <a href={href} className="shrink-0">
        <Cover item={item} className="h-28 w-20 rounded shadow-sm" />
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <a href={href} className="hover:underline">
          <h3 className="line-clamp-2 leading-snug font-medium" title={title}>
            {title}
          </h3>
        </a>
        <p className="mt-0.5 line-clamp-1 text-sm text-[var(--muted)]">{[item.authors, year].filter(Boolean).join(' · ') || 'Autor desconhecido'}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${RIGHTS_STYLE[rights.kind]}`}>{rights.label}</span>
          <span className="text-[var(--muted)]">{SOURCE_LABEL[item.source]}</span>
          {!!item.downloads && <span className="text-[var(--muted)]">· {item.downloads.toLocaleString('pt-BR')} downloads</span>}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <DownloadButton item={item} bookId={bookId} />
        </div>
      </div>
    </article>
  );
}
