import { Check } from 'lucide-react';
import { useState } from 'react';
import type { CatalogItem } from '../../lib/catalog/types';
import { catalogHref } from './routes';

// Covers for books without one, picked by title so a book always gets the same.
const PLAIN_COVERS = ['bg-amber-700', 'bg-emerald-800', 'bg-sky-800', 'bg-rose-800', 'bg-violet-800', 'bg-stone-700'];

/** A book cover, or a plain one with the title when the catalog has none (or it fails to load). */
export function Cover({ item, className = '' }: { item: CatalogItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (item.cover && !failed)
    return <img src={item.cover} alt="" loading="lazy" onError={() => setFailed(true)} className={`bg-[var(--panel)] object-cover ${className}`} />;
  const color = PLAIN_COVERS[[...item.title].reduce((n, c) => n + c.charCodeAt(0), 0) % PLAIN_COVERS.length];
  return (
    <div className={`flex flex-col justify-between overflow-hidden p-2 text-left text-white ${color} ${className}`}>
      <span className="line-clamp-4 font-serif text-xs leading-tight font-semibold">{item.title}</span>
      <span className="line-clamp-2 text-[10px] opacity-80">{item.authors}</span>
    </div>
  );
}

/** Cover, title and author, opening the book's page: for shelves and grids. */
export default function BookTile({ item, onShelf, className = '' }: { item: CatalogItem; onShelf?: boolean; className?: string }) {
  return (
    <a href={catalogHref.book(item.key)} className={`group block ${className}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-md shadow-md ring-1 ring-black/5 transition group-hover:-translate-y-1 group-hover:shadow-lg">
        <Cover item={item} className="size-full" />
        {onShelf && (
          <span title="Na estante" className="absolute top-1 right-1 rounded-full bg-emerald-600 p-0.5 text-white shadow">
            <Check className="size-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 line-clamp-2 text-sm leading-snug font-medium" title={item.title}>
        {item.title}
      </div>
      <div className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">{item.authors || 'Autor desconhecido'}</div>
    </a>
  );
}

/** Placeholder while a shelf or grid loads. */
export function TileSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <div className="aspect-[2/3] animate-pulse rounded-md bg-[var(--border)]" />
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-[var(--border)]" />
      <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-[var(--border)]" />
    </div>
  );
}
