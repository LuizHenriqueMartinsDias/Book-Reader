import type { BookFormat } from '../../db/schema';

export type Language = 'all' | 'por' | 'eng' | 'spa' | 'fre';

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

/** A search result from any catalog, ready for the result card. */
export interface CatalogItem {
  key: string;
  title: string;
  authors: string;
  year: number | null;
  rights: Rights;
  downloads?: number;
  cover: string | null;
  pageUrl: string;
  /** Finds the file to download (may need another request). */
  resolveFile: (signal?: AbortSignal) => Promise<BookFile | null>;
}

export interface CatalogPage {
  total: number;
  items: CatalogItem[];
  hasMore: boolean;
}
