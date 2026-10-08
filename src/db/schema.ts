import Dexie, { type EntityTable } from 'dexie';

/**
 * All coordinates are in page *view* space at scale 1: PDF points, origin at the top-left
 * of the page as displayed (crop box, page /Rotate applied). See lib/coords.ts.
 */
export type Point = [x: number, y: number, pressure: number];
export type Rect = [x: number, y: number, w: number, h: number];

export interface Book {
  id: string;
  title: string;
  pageCount: number;
  coverThumb?: string;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  zoom: number;
  fileSize: number;
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
  page: number;
  color: string;
  rects: Rect[];
  text: string;
  createdAt: number;
}

export interface Note {
  id: string;
  bookId: string;
  page: number;
  highlightId?: string;
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
