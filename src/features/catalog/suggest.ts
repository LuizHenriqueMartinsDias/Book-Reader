import { CATEGORIES, featuredAuthors, type Category } from '../../lib/catalog/shelves';
import type { CatalogItem } from '../../lib/catalog/types';

/** Lowercase without accents, keeping each character in place (so a match can be highlighted). */
export const fold = (s: string) => s.normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface Suggestions {
  recent: string[];
  authors: string[];
  genres: Category[];
  books: CatalogItem[];
}

const ALL_AUTHORS = [...new Set((['por', 'eng', 'spa', 'fre'] as const).flatMap((l) => featuredAuthors(l)))];

/**
 * What to offer while a search is typed, all from what's at hand (no request per keystroke):
 * past searches, known authors, genres and books already seen in this session.
 */
export function suggest(input: string, recentSearches: string[], seen: CatalogItem[]): Suggestions {
  const q = fold(input.trim());
  if (!q) return { recent: recentSearches.slice(0, 5), authors: [], genres: [], books: [] };
  const has = (s: string) => fold(s).includes(q);
  const seenAuthors = seen.flatMap((i) => i.authors.split(';').map((a) => a.trim())).filter(Boolean);
  const books = new Map<string, CatalogItem>();
  for (const item of seen) if (has(item.title) && !books.has(fold(item.title))) books.set(fold(item.title), item);
  return {
    recent: recentSearches.filter((r) => has(r) && fold(r) !== q).slice(0, 3),
    authors: q.length < 2 ? [] : [...new Set([...ALL_AUTHORS, ...seenAuthors])].filter(has).slice(0, 3),
    genres: CATEGORIES.filter((c) => has(c.label)).slice(0, 2),
    books: [...books.values()].slice(0, 4),
  };
}
