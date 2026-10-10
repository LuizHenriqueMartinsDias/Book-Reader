import { CATEGORIES, homeShelves } from '../../lib/catalog/shelves';
import type { BrowseFilter, Language, Source } from '../../lib/catalog/types';

/** A full list of books: a genre, a home shelf, an author or a subject, across catalogs. */
export interface ListSpec {
  title: string;
  subtitle?: string;
  filter: BrowseFilter;
  sources: Source[];
}

export type SourceChoice = Source | 'all';

export type CatalogView =
  | { kind: 'home' }
  | { kind: 'search'; query: string; source: SourceChoice }
  | { kind: 'list'; list: ListSpec | null }
  | { kind: 'book'; key: string };

const BOTH: Source[] = ['gutenberg', 'archive'];

/**
 * #/explorar[?q=<text>[&fonte=gutenberg|archive]] · #/explorar/livro/<key> ·
 * #/explorar/categoria/<id> · #/explorar/prateleira/<id> · #/explorar/autor/<name> · #/explorar/assunto/<subject>
 */
export function parseCatalogView(path: string, params: URLSearchParams, language: Language): CatalogView {
  const [, kind, raw] = path.match(/^\/explorar\/([^/]+)\/(.+)$/) ?? [];
  const arg = raw ? decodeURIComponent(raw) : '';
  switch (kind) {
    case 'livro':
      return { kind: 'book', key: arg };
    case 'categoria': {
      const c = CATEGORIES.find((c) => c.id === arg);
      return { kind: 'list', list: c ? { title: c.label, filter: { subject: c.subject }, sources: BOTH } : null };
    }
    case 'prateleira': {
      const shelf = homeShelves(language).find((s) => s.id === arg);
      return { kind: 'list', list: shelf ? { title: shelf.title, filter: shelf.filter, sources: BOTH } : null };
    }
    case 'autor':
      return { kind: 'list', list: { title: arg, subtitle: 'Autor', filter: { authors: [arg] }, sources: BOTH } };
    case 'assunto':
      return { kind: 'list', list: { title: arg, subtitle: 'Assunto', filter: { subject: { gutenberg: arg, archive: [arg] } }, sources: BOTH } };
  }
  const query = params.get('q')?.trim();
  if (query) {
    const source = params.get('fonte');
    return { kind: 'search', query, source: source === 'gutenberg' || source === 'archive' ? source : 'all' };
  }
  return { kind: 'home' };
}

const enc = encodeURIComponent;

export const catalogHref = {
  home: '#/explorar',
  search: (query: string, source: SourceChoice = 'all') => `#/explorar?q=${enc(query)}${source === 'all' ? '' : `&fonte=${source}`}`,
  book: (key: string) => `#/explorar/livro/${enc(key)}`,
  category: (id: string) => `#/explorar/categoria/${enc(id)}`,
  shelf: (id: string) => `#/explorar/prateleira/${enc(id)}`,
  author: (name: string) => `#/explorar/autor/${enc(name)}`,
  subject: (subject: string) => `#/explorar/assunto/${enc(subject)}`,
};
