import Dexie, { type DBCore, type EntityTable, type Middleware } from 'dexie';

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
  /**
   * Scroll mode zoom relative to 100% (0 = fit width), and page-by-page zoom as a multiple of
   * the fit-page size (absent = fit), so it means the same in portrait and landscape.
   */
  zoom: number;
  pagedZoomFactor?: number;
  fileSize: number;
  /** EPUB reading position (CFI) and fraction read. */
  lastLocation?: string;
  progress?: number;
  /** EPUB: cached epub.js locations (JSON), slow to compute for long books. */
  locations?: string;
  /** Library folder (`bookFolders`); absent or null when the book isn't in one. */
  folderId?: string | null;
  /** Catalog entry it was downloaded from (`pg:<id>`, `ia:<identifier>`), so the catalog shows it as on the shelf. */
  catalogKey?: string;
}

/** Kept apart from `books` so listing the library doesn't load every PDF into memory. */
export interface BookFile {
  bookId: string;
  data: Blob;
}

export type InkTool = 'pen' | 'marker';
/**
 * Kind of pen: `pen` follows pressure, `fineliner` keeps an even line, `brush` swells with
 * pressure and tapers at the ends, `pencil` is grainy and a little see-through.
 */
export type Brush = 'pen' | 'fineliner' | 'brush' | 'pencil';

export interface Stroke {
  id: string;
  bookId: string;
  page: number;
  tool: InkTool;
  /** Pen strokes only; absent on older strokes, which are all `pen`. */
  brush?: Brush;
  color: string;
  /** How opaque the ink is, 0–1, on top of the marker's and pencil's own see-through; absent = 1. */
  opacity?: number;
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
  /**
   * PDF: stuck on the page as a post-it, at this spot and size (page view space at scale 1,
   * like strokes); with its paper color and whether it's folded down to an icon.
   */
  pin?: { x: number; y: number; w: number; h: number };
  /** Paper color: a note with one is a post-it (on a PDF page by `pin`, in an EPUB by `cfi`). */
  color?: string;
  collapsed?: boolean;
  /** Handwriting on the post-it, in points from its top-left corner (it moves with it). */
  ink?: Pick<Stroke, 'tool' | 'brush' | 'color' | 'opacity' | 'width' | 'points'>[];
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

/** Look of a notebook's cover, over `coverColor`. */
export type CoverPattern = 'plain' | 'stripes' | 'grid' | 'dots' | 'linen' | 'chevron' | 'leather' | 'kraft';

export interface NotebookCover {
  pattern: CoverPattern;
  /** A picture of the user's covering it, in `noteAssets` (so it's backed up and deleted with the notebook). */
  imageId?: string;
  /** Which part of the picture shows, like CSS object-position, in percent; absent = centered. */
  imagePos?: [x: number, y: number];
  /** The title on a label; absent = shown. */
  label?: boolean;
  /** What the notebook's card shows: this cover, or its first page. */
  show: 'cover' | 'page';
}

export interface Notebook {
  id: string;
  folderId?: string | null;
  title: string;
  kind: NotebookKind;
  paper: Paper;
  /** Cover color (the spine, and the cover under its pattern). */
  coverColor: string;
  /** Absent on notebooks made before covers: their card shows the first page. */
  cover?: NotebookCover;
  /** Small image of the first page, refreshed when leaving the editor. */
  thumb?: string;
  /**
   * Infinite canvas: where the view was left. With `centered`, (x, y) is the world point at the
   * center of the screen; older saves have the top-left point and no rotation.
   */
  camera?: { x: number; y: number; zoom: number; rotation?: number; centered?: boolean };
  /** Imported from a PDF: the file lives in `files` under the notebook id. */
  hasPdf?: boolean;
  sourceBookId?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

/** Blank space added around an imported PDF page ("stretching" the sheet), in points. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NotePage {
  id: string;
  notebookId: string;
  order: number;
  /** In points; A4 is 595 × 842. Ignored for infinite canvases. Includes the margins. */
  width: number;
  height: number;
  /**
   * What's drawn underneath, inset by `margins` if any: a page of the notebook's PDF (imported
   * PDFs) or one of the user's page templates.
   */
  background?: { pdfPage?: number; template?: string; margins?: Margins };
}

/** A page design of the user's (a planner, Cornell notes…), from a picture or a PDF page. */
export interface PageTemplate {
  id: string;
  name: string;
  /** The design as a picture (PNG or JPEG, which PDF export can embed). */
  blob: Blob;
  /** Size of a page made with it, in points. */
  width: number;
  height: number;
  /** Small picture for choosing it. */
  thumb: string;
  createdAt: number;
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
  /** Ink written inside a diagram box: the box's id, so it moves, resizes and goes with it. */
  parentId?: string;
}

/** All note item coordinates are in page points from the top-left corner. */
export interface StrokeItem extends NoteItemBase {
  type: 'stroke';
  tool: InkTool;
  /** Pen strokes only; absent on older strokes, which are all `pen`. */
  brush?: Brush;
  color: string;
  /** How opaque the ink is, 0–1, on top of the marker's and pencil's own see-through; absent = 1. */
  opacity?: number;
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

export type NodeShape = 'rect' | 'round' | 'ellipse' | 'diamond';

/** A diagram box: an outlined shape with typed text centered in it (and maybe handwriting, by `parentId`). */
export interface NodeItem extends NoteItemBase {
  type: 'node';
  shape: NodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Outline color; a filled box gets a light tint of it. */
  color: string;
  filled: boolean;
  /** Outline width. */
  width: number;
  text: string;
  fontSize: number;
}

export type ConnectorRoute = 'straight' | 'elbow' | 'curve';
export type ConnectorArrows = 'end' | 'both' | 'none';

/**
 * One end of a diagram arrow: on a box (`node`; the arrow meets its edge, wherever the box goes)
 * or loose at (x, y). For an end on a box, (x, y) is where it last was, for its bounding box.
 */
export interface ConnectorEnd {
  node?: string;
  x: number;
  y: number;
}

/** An arrow between diagram boxes; its path is worked out from where the boxes are. */
export interface ConnectorItem extends NoteItemBase {
  type: 'connector';
  from: ConnectorEnd;
  to: ConnectorEnd;
  route: ConnectorRoute;
  arrows: ConnectorArrows;
  color: string;
  width: number;
  /** Text on the arrow ("sim", "não"…). */
  label: string;
  fontSize: number;
}

/**
 * A post-it: colored paper over the page with typed text, and handwriting (by `parentId`) that
 * moves with it. It grows to fit its text; collapsed, it's just a small folded icon.
 */
export interface StickyItem extends NoteItemBase {
  type: 'sticky';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Paper color. */
  color: string;
  text: string;
  fontSize: number;
  collapsed?: boolean;
}

export type NoteItem = StrokeItem | ShapeItem | TextItem | ImageItem | NodeItem | ConnectorItem | StickyItem;

export interface NoteAsset {
  id: string;
  notebookId: string;
  blob: Blob;
  width: number;
  height: number;
}

// ---- Routine (habits tracked day by day) ----

/** `check`: done or not. `count`: units toward a goal (glasses of water). `time`: minutes toward a goal. */
export type HabitKind = 'check' | 'count' | 'time';
/** Time the app measures by itself: reading books, or writing in notebooks. */
export type ActivityKind = 'reading' | 'study';

export interface Habit {
  id: string;
  name: string;
  /** Key of one of the routine's icons (features/routine/icons.ts). */
  icon: string;
  color: string;
  kind: HabitKind;
  /** Per day: 1 for `check`, units for `count`, minutes for `time`. */
  goal: number;
  /** `count`: what's counted ("copos"). */
  unit?: string;
  /** `count`: how much each "+" adds; absent = 1. */
  step?: number;
  /** `count`: quick amounts to add instead of a single "+" (a glass, a mug, a bottle: 200, 300, 500 ml). */
  amounts?: number[];
  /** Days of the week it's due (0 = Sunday); absent = every day. Other days neither count nor break a streak. */
  days?: number[];
  /** National holidays are days off for it. */
  holidaysOff?: boolean;
  /** `time` habits only: the app counts this activity's minutes as done. */
  auto?: ActivityKind;
  order: number;
  createdAt: number;
  /** Hidden from the routine (its history stays). */
  archived?: boolean;
}

/** A habit on one day (local date `YYYY-MM-DD`); its id is `${habitId}|${date}`. */
export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  /** Done (`check`: 1), units or minutes; for an `auto` habit, added to the measured minutes (a correction). */
  value: number;
  /** A day off for this habit (holiday, gym closed): it neither counts nor breaks the streak. */
  off?: boolean;
  /** What was added through the day, in order (habits with quick amounts), so one can be taken back. */
  entries?: number[];
  updatedAt: number;
}

/** A day off for every habit (travel, sick); its id is the date. */
export interface DayOff {
  id: string;
}

/** Seconds of reading or study the app measured on a day; its id is `${kind}|${date}`. */
export interface Activity {
  id: string;
  kind: ActivityKind;
  date: string;
  seconds: number;
}

/** Small app values that must live in IndexedDB, e.g. a backup folder's handle (not storable in localStorage). */
export interface Setting {
  key: string;
  value: unknown;
}

export class BookDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  files!: EntityTable<BookFile, 'bookId'>;
  strokes!: EntityTable<Stroke, 'id'>;
  highlights!: EntityTable<Highlight, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  /** Notebook folders. */
  folders!: EntityTable<Folder, 'id'>;
  /** Library folders, apart from the notebooks' ones. */
  bookFolders!: EntityTable<Folder, 'id'>;
  notebooks!: EntityTable<Notebook, 'id'>;
  notePages!: EntityTable<NotePage, 'id'>;
  noteItems!: EntityTable<NoteItem, 'id'>;
  noteAssets!: EntityTable<NoteAsset, 'id'>;
  pageTemplates!: EntityTable<PageTemplate, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  dayOffs!: EntityTable<DayOff, 'id'>;
  activity!: EntityTable<Activity, 'id'>;

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
    // v3: library folders. Adds a table and indexes books by folder; nothing else changes.
    this.version(3).stores({
      books: 'id, lastOpenedAt, addedAt, folderId',
      bookFolders: 'id, order',
    });
    // v4: page templates. Only adds a table.
    this.version(4).stores({
      pageTemplates: 'id, createdAt',
    });
    // v5: app settings. Only adds a table.
    this.version(5).stores({
      settings: 'key',
    });
    // v6: the routine (habits). Only adds tables.
    this.version(6).stores({
      habits: 'id, order',
      habitLogs: 'id, habitId, date',
      dayOffs: 'id',
      activity: 'id, date',
    });
    this.use(changeTracker);
  }
}

/** What a backup holds: writes to these mean there's something new to back up (books' reading position doesn't count). */
const BACKED_UP = new Set(['strokes', 'highlights', 'notes', 'folders', 'bookFolders', 'notebooks', 'notePages', 'noteItems', 'noteAssets', 'pageTemplates', 'habits', 'habitLogs', 'dayOffs', 'activity']);
const CHANGED_AT_KEY = 'book-reader-changed-at';

/**
 * Notes the time of every write (deletions too) to the backed-up tables, so the backup reminder
 * knows if anything changed without scanning every stroke.
 */
const changeTracker: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'changeTracker',
  create: (down) => ({
    ...down,
    table: (name) => {
      const table = down.table(name);
      if (!BACKED_UP.has(name)) return table;
      return {
        ...table,
        mutate: async (req) => {
          const res = await table.mutate(req);
          try {
            localStorage.setItem(CHANGED_AT_KEY, String(Date.now()));
          } catch {
            // No storage (private mode): the reminder then assumes there were changes.
          }
          return res;
        },
      };
    },
  }),
};

/** When annotations or notebooks last changed, or null if unknown (nothing recorded on this device yet). */
export function lastChangeAt(): number | null {
  try {
    const v = Number(localStorage.getItem(CHANGED_AT_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export const db = new BookDB();
