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

// ---- Notebooks (handwritten/typed study notes) ----

export type PaperStyle = 'blank' | 'lined' | 'grid' | 'dotted';
export interface Paper {
  style: PaperStyle;
  /** Page color. */
  color: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

/** `paged`: A4-like pages in sequence. `canvas`: one boundless board. */
export type NotebookKind = 'paged' | 'canvas';

export interface Notebook {
  id: string;
  folderId?: string | null;
  title: string;
  kind: NotebookKind;
  paper: Paper;
  coverColor: string;
  /** Small image of the first page, refreshed when leaving the editor. */
  thumb?: string;
  /** Infinite canvas: where the view was left (world point at the top-left, and zoom). */
  camera?: { x: number; y: number; zoom: number };
  /** Imported from a PDF: the file lives in `files` under the notebook id. */
  hasPdf?: boolean;
  sourceBookId?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface NotePage {
  id: string;
  notebookId: string;
  order: number;
  /** In points; A4 is 595 × 842. Ignored for infinite canvases. */
  width: number;
  height: number;
  /** Page of the notebook's PDF drawn underneath (imported PDFs). */
  background?: { pdfPage: number };
}

/** Where a quote sent from the reader came from, to jump back to it. */
export interface QuoteSource {
  bookId: string;
  title: string;
  page?: number;
  cfi?: string;
}

interface NoteItemBase {
  id: string;
  notebookId: string;
  pageId: string;
  /** Stacking order within the page. */
  z: number;
  createdAt: number;
}

/** All note item coordinates are in page points from the top-left corner. */
export interface StrokeItem extends NoteItemBase {
  type: 'stroke';
  tool: InkTool;
  color: string;
  width: number;
  points: Point[];
}

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse';
export interface ShapeItem extends NoteItemBase {
  type: 'shape';
  shape: ShapeKind;
  /** Line/arrow: from (x1, y1) to (x2, y2). Rect/ellipse: opposite corners of the box. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface TextItem extends NoteItemBase {
  type: 'text';
  x: number;
  y: number;
  /** Box width; the height follows the text (`h` is the last measured height, for selection). */
  w: number;
  h?: number;
  text: string;
  fontSize: number;
  color: string;
  source?: QuoteSource;
}

export interface ImageItem extends NoteItemBase {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  assetId: string;
}

export type NoteItem = StrokeItem | ShapeItem | TextItem | ImageItem;

export interface NoteAsset {
  id: string;
  notebookId: string;
  blob: Blob;
  width: number;
  height: number;
}

export class BookDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  files!: EntityTable<BookFile, 'bookId'>;
  strokes!: EntityTable<Stroke, 'id'>;
  highlights!: EntityTable<Highlight, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  folders!: EntityTable<Folder, 'id'>;
  notebooks!: EntityTable<Notebook, 'id'>;
  notePages!: EntityTable<NotePage, 'id'>;
  noteItems!: EntityTable<NoteItem, 'id'>;
  noteAssets!: EntityTable<NoteAsset, 'id'>;

  constructor(name = 'book-reader') {
    super(name);
    this.version(1).stores({
      books: 'id, lastOpenedAt, addedAt',
      files: 'bookId',
      strokes: 'id, bookId, [bookId+page]',
      highlights: 'id, bookId, [bookId+page]',
      notes: 'id, bookId, [bookId+page], highlightId',
    });
    // v2: notebooks. Only adds tables, so existing books and annotations are untouched.
    this.version(2).stores({
      folders: 'id, order',
      notebooks: 'id, folderId, updatedAt, lastOpenedAt',
      notePages: 'id, notebookId, [notebookId+order]',
      noteItems: 'id, pageId, notebookId',
      noteAssets: 'id, notebookId',
    });
  }
}

export const db = new BookDB();
