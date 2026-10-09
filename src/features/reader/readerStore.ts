import { create } from 'zustand';
import type { BookFormat } from '../../db/schema';
import type { EpubBook } from '../../lib/epub';
import type { PDFDocumentProxy } from '../../lib/pdf';

export type SidebarTab = 'outline' | 'notes' | 'search';

interface ReaderState {
  bookId: string;
  format: BookFormat;
  doc: PDFDocumentProxy | null;
  epub: EpubBook | null;
  /** PDF: page. EPUB: chapter (spine index + 1). */
  currentPage: number;
  /** EPUB: CFI of the start of the visible text. */
  currentCfi: string | null;
  sidebarTab: SidebarTab;
  /** Note to scroll to and focus in the notes panel. */
  focusNoteId: string | null;
  /** A post-it just stuck on a page: it opens for typing. */
  freshStickyId: string | null;
  /** Effective CSS px per PDF point of the active view. */
  scale: number;
  /** Paged view: the scale that fits a page/spread on screen (zoom there is relative to it). */
  fitScale: number;
  /** Navigation registered by the active view (scroll or paged). */
  goToPage: (page: number) => void;
  next: () => void;
  prev: () => void;
  /** EPUB: jump to a CFI or a table-of-contents href. */
  goToCfi: (target: string) => void;
  set: (patch: Partial<Omit<ReaderState, 'set'>>) => void;
}

/** Per-open-book state shared by the reader's components; reset when a book opens. */
export const useReader = create<ReaderState>((set) => ({
  bookId: '',
  format: 'pdf',
  doc: null,
  epub: null,
  currentPage: 1,
  currentCfi: null,
  sidebarTab: 'notes',
  focusNoteId: null,
  freshStickyId: null,
  scale: 1,
  fitScale: 1,
  goToPage: () => {},
  next: () => {},
  prev: () => {},
  goToCfi: () => {},
  set: (patch) => set(patch),
}));
