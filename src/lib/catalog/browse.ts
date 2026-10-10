import { getArchiveItem, searchArchiveItems } from './archive';
import { getGutenbergItem, searchGutenberg } from './gutenberg';
import type { BookFile, BrowseFilter, BrowseQuery, CatalogItem, CatalogPage, Source } from './types';

/** One place to list and look up books across catalogs. */

export const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: 'gutenberg', label: 'Project Gutenberg', hint: 'Clássicos em EPUB, revisados e leves' },
  { id: 'archive', label: 'Internet Archive', hint: 'PDFs e EPUBs, inclusive livros escaneados' },
];

/** Whether a catalog can list what the filter asks for (Gutenberg takes one author and needs its own topic). */
export function supports(source: Source, f: BrowseFilter) {
  if (source === 'archive') return !f.subject || !!f.subject.archive?.length;
  return (f.authors?.length ?? 0) <= 1 && (!f.subject || !!f.subject.gutenberg);
}

/**
 * Network failures are retried once: the Archive's search sometimes times out, and its error
 * pages lack CORS headers, so the browser only reports a failed fetch (a TypeError).
 */
export async function browse(q: BrowseQuery, page: number, signal?: AbortSignal): Promise<CatalogPage> {
  try {
    return await browseOnce(q, page, signal);
  } catch (e) {
    if (!(e instanceof TypeError) || signal?.aborted || !navigator.onLine) throw e;
    return browseOnce(q, page, signal);
  }
}

function browseOnce(q: BrowseQuery, page: number, signal?: AbortSignal): Promise<CatalogPage> {
  if (q.source === 'gutenberg') {
    return searchGutenberg({ query: q.query, author: q.authors?.[0], topic: q.subject?.gutenberg, language: q.language, page }, signal);
  }
  return searchArchiveItems(
    { query: q.query ?? '', authors: q.authors, subjects: q.subject?.archive, language: q.language, openOnly: q.openOnly, page },
    signal,
  );
}

// Books seen in this session, so their page opens at once.
const items = new Map<string, CatalogItem>();

export function remember(list: CatalogItem[]) {
  for (const item of list) if (!items.has(item.key)) items.set(item.key, item);
}

export const recalled = (key: string) => items.get(key);

/** Every book seen in this session, for suggestions while typing a search. */
export const rememberedItems = () => [...items.values()];

/** The full record of a book (search results lack the description, and Archive items their file). */
export async function loadItem(key: string, signal?: AbortSignal): Promise<{ item: CatalogItem; file?: BookFile | null }> {
  const [prefix, id] = [key.slice(0, 3), key.slice(3)];
  if (prefix === 'ia:') {
    const found = await getArchiveItem(id, signal);
    // The search result knows the download count, which the Archive's metadata lacks.
    const item = { ...found.item, downloads: items.get(key)?.downloads ?? found.item.downloads };
    items.set(key, item);
    return { item, file: found.file };
  }
  if (prefix === 'pg:') {
    const item = await getGutenbergItem(id, signal);
    items.set(key, item);
    return { item, file: gutenbergFile(item) };
  }
  throw new Error('Livro não encontrado');
}

const gutenbergFile = (item: CatalogItem): BookFile | null =>
  item.fileUrl ? { url: item.fileUrl, name: `${item.key.replace(':', '')}.epub`, size: null, format: 'epub' } : null;

/** The file to download (may need another request). */
export async function resolveFile(item: CatalogItem, signal?: AbortSignal): Promise<BookFile | null> {
  return item.source === 'gutenberg' ? gutenbergFile(item) : (await getArchiveItem(item.key.slice(3), signal)).file;
}

const CACHE_PREFIX = 'book-reader-catalog:';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 40;

/**
 * First page of a shelf, kept for a day in localStorage: catalogs change slowly, and
 * the home screen then opens without waiting on them.
 */
// Shelves asking for the same list at once (the home's ranking and its book of the week) share one request.
const pending = new Map<string, Promise<CatalogPage>>();

export function browseCached(q: BrowseQuery): Promise<CatalogPage> {
  const key = CACHE_PREFIX + JSON.stringify(q);
  const shared = pending.get(key);
  if (shared) return shared;
  const promise = loadCached(key, q).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

async function loadCached(key: string, q: BrowseQuery): Promise<CatalogPage> {
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; page: CatalogPage } | null;
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.page;
  } catch {
    // Unreadable cache entry: fetch again.
  }
  const page = await browse(q, 1);
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), page }));
    pruneCache();
  } catch {
    // Storage full or unavailable: the shelf still shows, it just isn't kept.
  }
  return page;
}

function pruneCache() {
  const entries: { key: string; at: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    try {
      entries.push({ key, at: (JSON.parse(localStorage.getItem(key)!) as { at: number }).at });
    } catch {
      entries.push({ key, at: 0 });
    }
  }
  entries
    .sort((a, b) => b.at - a.at)
    .slice(CACHE_MAX)
    .forEach((e) => localStorage.removeItem(e.key));
}
