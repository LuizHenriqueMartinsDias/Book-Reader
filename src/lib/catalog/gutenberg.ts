import { plainText, subjectLabels } from './text';
import type { CatalogItem, CatalogPage, Language } from './types';

/**
 * Project Gutenberg through its own OPDS catalog (Atom XML, allows cross-origin requests):
 * fast, and its search takes the site's prefixes (`a.` author, `s.` subject, `l.` language).
 */
const SITE = 'https://www.gutenberg.org';
export const PAGE_SIZE = 25;

const LANG: Record<Exclude<Language, 'all'>, string> = { por: 'pt', eng: 'en', spa: 'es', fre: 'fr' };

// Search results end the title with the book's language, "Dom Casmurro (Portuguese)".
const LANGUAGE_SUFFIX =
  /\s*\((?:(?:English|Portuguese|French|Spanish|German|Italian|Latin|Dutch|Finnish|Swedish|Danish|Norwegian|Greek|Esperanto|Catalan|Polish|Czech|Hungarian|Russian|Chinese|Japanese|Tagalog|Welsh|Irish|Galician)(?:, )?)+\)$/;

export const coverOf = (id: string) => `${SITE}/cache/epub/${id}/pg${id}.cover.medium.jpg`;
export const epubOf = (id: string) => `${SITE}/ebooks/${id}.epub3.images`;

function baseItem(id: string, title: string, authors: string): CatalogItem {
  return {
    key: `pg:${id}`,
    source: 'gutenberg',
    title: title.replace(/\s+/g, ' ').replace(LANGUAGE_SUFFIX, '').trim(),
    authors,
    year: null,
    rights: { kind: 'public-domain', label: 'Domínio público' },
    cover: coverOf(id),
    pageUrl: `${SITE}/ebooks/${id}`,
    fileUrl: epubOf(id),
  };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const bookId = (entry: Element) => text(entry.querySelector(':scope > id')).match(/\/ebooks\/(\d+)\.opds$/)?.[1];

/** Books of a search feed; its other entries (links to subjects, sort orders) are skipped. */
export function parseSearchFeed(xml: string): CatalogPage {
  const doc = parse(xml);
  const items: CatalogItem[] = [];
  for (const entry of doc.querySelectorAll('entry')) {
    const id = bookId(entry);
    if (!id) continue;
    // The content is the author, or the download count for books without one.
    const content = text(entry.querySelector('content'));
    const downloads = content.match(/^(\d+) downloads?$/)?.[1];
    items.push({ ...baseItem(id, text(entry.querySelector('title')), downloads ? '' : content), downloads: Number(downloads) || undefined });
  }
  return { items, hasMore: !!doc.querySelector('feed > link[rel="next"]') };
}

/** A book's own feed: summary, subjects, bookshelves, download count and rights. */
export function parseBookFeed(id: string, xml: string): CatalogItem {
  const entry = parse(xml).querySelector('entry');
  if (!entry) throw new Error('Livro não encontrado no Project Gutenberg');
  const authors = [...entry.querySelectorAll(':scope > author > name')].map(text).join('; ');
  const item = baseItem(id, text(entry.querySelector(':scope > title')), authors);
  const fields = new Map<string, string>();
  for (const p of entry.querySelectorAll('content p')) {
    const m = text(p).match(/^([\w ]+?):\s*(.*)$/);
    if (m && !fields.has(m[1])) fields.set(m[1], m[2]);
  }
  const shelves = [...entry.querySelectorAll('link[rel="related"]')].map((l) => l.getAttribute('title') ?? '').filter((t) => t.startsWith('In ')).map((t) => t.slice(3).replace(/…$/, ''));
  const subjects = [...entry.querySelectorAll('category[scheme$="LCSH"]')].map((c) => c.getAttribute('term') ?? '');
  const rights = text(entry.querySelector('rights'));
  return {
    ...item,
    downloads: Number(fields.get('Downloads')) || undefined,
    summary: plainText(fields.get('Summary')?.replace(/\s*\(This is an automatically generated summary\.\)\s*$/, '')) || undefined,
    // Bookshelves ("Category: Novels") first: they make better links than the library subjects.
    subjects: subjectLabels([...shelves, ...subjects]),
    rights: !rights || /public domain/i.test(rights) ? item.rights : { kind: 'unknown', label: 'Com permissão do autor' },
  };
}

/** Words of a name or topic, each with a search prefix: ("a.", "Machado de Assis") → "a.machado a.assis". */
const prefixed = (prefix: string, s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2)
    .map((w) => prefix + w)
    .join(' ');

export interface GutenbergParams {
  query?: string;
  author?: string;
  /** Words of its subjects and bookshelves. */
  topic?: string;
  language: Language;
  page: number;
}

/** Most downloaded first when browsing; by relevance when searching for words. */
export function gutenbergUrl({ query, author, topic, language, page }: GutenbergParams) {
  const terms = [query?.trim(), author && prefixed('a.', author), topic && prefixed('s.', topic), language !== 'all' && `l.${LANG[language]}`];
  const url = new URL(`${SITE}/ebooks/search.opds/`);
  url.searchParams.set('query', terms.filter(Boolean).join(' '));
  if (!query?.trim()) url.searchParams.set('sort_order', 'downloads');
  if (page > 1) url.searchParams.set('start_index', String((page - 1) * PAGE_SIZE + 1));
  return url;
}

async function get(url: URL | string, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha na busca do Project Gutenberg (${res.status})`);
  return res.text();
}

export async function searchGutenberg(params: GutenbergParams, signal?: AbortSignal): Promise<CatalogPage> {
  return parseSearchFeed(await get(gutenbergUrl(params), signal));
}

export async function getGutenbergItem(id: string, signal?: AbortSignal): Promise<CatalogItem> {
  return parseBookFeed(id, await get(`${SITE}/ebooks/${encodeURIComponent(id)}.opds`, signal));
}
