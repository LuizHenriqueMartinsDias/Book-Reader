import { create } from 'zustand';
import type { PDFDocumentProxy } from '../../lib/pdf';

export type SidebarTab = 'outline' | 'notes' | 'search';

interface ReaderState {
  bookId: string;
  doc: PDFDocumentProxy | null;
  currentPage: number;
  sidebarTab: SidebarTab;
  /** Note to scroll to and focus in the notes panel. */
  focusNoteId: string | null;
  goToPage: (page: number) => void;
  set: (patch: Partial<Omit<ReaderState, 'set'>>) => void;
}

/** Per-open-book state shared by the reader's components; reset when a book opens. */
export const useReader = create<ReaderState>((set) => ({
  bookId: '',
  doc: null,
  currentPage: 1,
  sidebarTab: 'notes',
  focusNoteId: null,
  goToPage: () => {},
  set: (patch) => set(patch),
}));
