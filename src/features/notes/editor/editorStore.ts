import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NoteItem, ShapeKind } from '../../../db/schema';

export type NoteTool = 'pen' | 'marker' | 'eraser' | 'lasso' | 'text' | 'shape';

export interface Selection {
  pageId: string;
  ids: string[];
}

interface NoteEditorState {
  tool: NoteTool;
  shape: ShapeKind;
  textSize: number;
  /** Lasso selection (on one page at a time). */
  selection: Selection | null;
  /** Copied items, pasted with an offset. */
  clipboard: NoteItem[] | null;
  /** Text box being typed in. */
  editingTextId: string | null;
  /** Page in view: where pasted items, images and quotes go. */
  currentPageId: string | null;
  /** Where to put something new (center of what's on screen), registered by the active view. */
  insertTarget: (() => { pageId: string; x: number; y: number; viewWidth: number }) | null;
  /** Without a stylus, fingers draw instead of scrolling. */
  fingerDraws: boolean;
  set: (patch: Partial<Omit<NoteEditorState, 'set'>>) => void;
}

export const useNoteEditor = create<NoteEditorState>()(
  persist(
    (set) => ({
      tool: 'pen',
      shape: 'line',
      textSize: 16,
      selection: null,
      clipboard: null,
      editingTextId: null,
      currentPageId: null,
      insertTarget: null,
      fingerDraws: false,
      set: (patch) => set(patch.tool ? { selection: null, editingTextId: null, ...patch } : patch),
    }),
    { name: 'book-reader-notes', partialize: ({ tool, shape, textSize, fingerDraws }) => ({ tool, shape, textSize, fingerDraws }) },
  ),
);
