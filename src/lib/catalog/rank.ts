import { normalize } from './text';
import type { CatalogItem } from './types';

/**
 * How well a book answers a typed search, 0 best: the exact title, a title starting with or
 * containing the words as typed, every word in the title, every word in title and author, the rest.
 * The catalogs' own order is kept within each tier.
 */
export function matchTier(item: CatalogItem, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const title = normalize(item.title);
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.includes(q)) return 2;
  const words = q.split(' ').filter((w) => w.length > 2);
  if (!words.length) return 5;
  if (words.every((w) => title.includes(w))) return 3;
  const both = `${title} ${normalize(item.authors)}`;
  return words.every((w) => both.includes(w)) ? 4 : 5;
}

/** Best matches first (a stable sort, so equally good results keep the catalogs' order). */
export const rankByQuery = (items: CatalogItem[], query: string) =>
  items
    .map((item, i) => ({ item, i, tier: matchTier(item, query) }))
    .sort((a, b) => a.tier - b.tier || a.i - b.i)
    .map((r) => r.item);
