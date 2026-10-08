import Dexie, { type EntityTable } from 'dexie';

/**
 * All coordinates are in page *view* space at scale 1: PDF points, origin at the top-left
 * of the page as displayed (crop box, page /Rotate applied). See lib/coords.ts.
 */
export type Point = [x: number, y: number, pressure: number];
export type Rect = [x: number, y: number, w: number, h: number];

export type BookFormat = 'pdf' | 'epub';

export interface Book {
  id: string;
  title: string;
  /** Absent on books stored before EPUB support, which are all PDFs. */
  format?: BookFormat;
  author?: string;
  /** PDF: number of pages. EPUB: 0 (reflowable text has no fixed pages). */
  pageCount: number;
  coverThumb?: string;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  zoom: number;
  fileSize: number;
  /** EPUB reading position (CFI) and fraction read. */
  lastLocation?: string;
  progress?: number;
  /** EPUB: cached epub.js locations (JSON), slow to compute for long books. */
  locations?: string;
}

/** Kept apart from `books` so listing the library doesn't load every PDF into memory. */
export interface BookFile {
  bookId: string;
  data: Blob;
}

export type InkTool = 'pen' | 'marker';

export interface Stroke {
  id: string;
  bookId: string;
  page: number;
  tool: InkTool;
  color: string;
  width: number;
  points: Point[];
  createdAt: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  /** PDF: page number. EPUB: chapter (spine index + 1), for grouping and filtering. */
  page: number;
  color: string;
  /** PDF only; empty for EPUB, which anchors by `cfi`. */
  rects: Rect[];
  /** EPUB: CFI range of the highlighted text. */
  cfi?: string;
  text: string;
  createdAt: number;
}

export interface Note {
  id: string;
  bookId: string;
  page: number;
  highlightId?: string;
  /** EPUB: where the note was taken (CFI). */
  cfi?: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export class BookDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  files!: EntityTable<BookFile, 'bookId'>;
  strokes!: EntityTable<Stroke, 'id'>;
  highlights!: EntityTable<Highlight, 'id'>;
  notes!: EntityTable<Note, 'id'>;

  constructor() {
    super('book-reader');
    this.version(1).stores({
      books: 'id, lastOpenedAt, addedAt',
      files: 'bookId',
      strokes: 'id, bookId, [bookId+page]',
      highlights: 'id, bookId, [bookId+page]',
      notes: 'id, bookId, [bookId+page], highlightId',
    });
  }
}

export const db = new BookDB();
