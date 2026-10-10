import type { BookFormat } from '../../db/schema';

export type Language = 'all' | 'por' | 'eng' | 'spa' | 'fre';

export type Source = 'gutenberg' | 'archive';

export type Rights =
  | { kind: 'public-domain'; label: string }
  | { kind: 'open-license'; label: string }
  | { kind: 'unknown'; label: string };

export interface BookFile {
  url: string;
  name: string;
  size: number | null;
  format: BookFormat;
}

/** A book from any catalog. Plain data, so it can be cached and shared between screens. */
export interface CatalogItem {
  /** `pg:<id>` or `ia:<identifier>`. */
  key: string;
  source: Source;
  title: string;
  authors: string;
  year: number | null;
  rights: Rights;
  downloads?: number;
  cover: string | null;
  pageUrl: string;
  summary?: string;
  subjects?: string[];
  /** Gutenberg: the EPUB, already known from the search. Archive items look theirs up. */
  fileUrl?: string;
}

export interface CatalogPage {
  items: CatalogItem[];
  hasMore: boolean;
}

/** What to list, independent of the catalog; a catalog that can't express it is skipped. */
export interface BrowseFilter {
  /** Free text: title, author or subject. */
  query?: string;
  /** Books by any of these authors. */
  authors?: string[];
  /** Gutenberg takes one topic (matched against its subjects and bookshelves); the Archive any of several subjects. */
  subject?: { gutenberg?: string; archive?: string[] };
}

export interface BrowseQuery extends BrowseFilter {
  source: Source;
  language: Language;
  /** Archive only: just works marked public domain / openly licensed, or old enough to be public domain. */
  openOnly: boolean;
}
