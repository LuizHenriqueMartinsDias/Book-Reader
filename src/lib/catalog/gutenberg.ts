import type { CatalogItem, CatalogPage, Language } from './types';

/** Project Gutenberg via Gutendex (a JSON API over its catalog that allows cross-origin requests). */
const API = 'https://gutendex.com/books/';

const LANG: Record<Exclude<Language, 'all'>, string> = { por: 'pt', eng: 'en', spa: 'es', fre: 'fr' };

interface GutendexBook {
  id: number;
  title: string;
  authors: { name: string; birth_year: number | null; death_year: number | null }[];
  languages: string[];
  copyright: boolean | null;
  download_count: number;
  formats: Record<string, string>;
}

interface GutendexPage {
  count: number;
  next: string | null;
  results: GutendexBook[];
}

/** Gutenberg writes authors as "Last, First"; show them the usual way round. */
const displayName = (name: string) => name.replace(/^([^,]+),\s*(.+)$/, '$2 $1');

export function gutenbergItem(b: GutendexBook): CatalogItem | null {
  const epub = b.formats['application/epub+zip'];
  if (!epub) return null;
  return {
    key: `pg:${b.id}`,
    title: b.title,
    authors: b.authors.map((a) => displayName(a.name)).join('; '),
    year: null,
    rights: b.copyright ? { kind: 'unknown', label: 'Com permissão do autor' } : { kind: 'public-domain', label: 'Domínio público' },
    downloads: b.download_count,
    cover: b.formats['image/jpeg'] ?? null,
    pageUrl: `https://www.gutenberg.org/ebooks/${b.id}`,
    resolveFile: async () => ({ url: epub, name: `pg${b.id}.epub`, size: null, format: 'epub' }),
  };
}

export async function searchGutenberg(params: { query: string; language: Language; page: number }, signal?: AbortSignal): Promise<CatalogPage> {
  const url = new URL(API);
  if (params.query.trim()) url.searchParams.set('search', params.query.trim());
  if (params.language !== 'all') url.searchParams.set('languages', LANG[params.language]);
  url.searchParams.set('page', String(params.page));
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha na busca do Project Gutenberg (${res.status})`);
  const data = (await res.json()) as GutendexPage;
  return {
    total: data.count,
    items: data.results.map(gutenbergItem).filter((i): i is CatalogItem => i !== null),
    hasMore: !!data.next,
  };
}
