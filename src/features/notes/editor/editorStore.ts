import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NoteItem, ShapeKind } from '../../../db/schema';
import type { Ruler } from '../../../lib/notes/ruler';

export type NoteTool = 'pen' | 'marker' | 'eraser' | 'lasso' | 'text' | 'shape';
/** `stroke`: touching ink deletes the whole stroke. `partial`: rubs out only what's under it. */
export type EraserMode = 'stroke' | 'partial';

export interface Selection {
  pageId: string;
  ids: string[];
}

interface NoteEditorState {
  tool: NoteTool;
  shape: ShapeKind;
  textSize: number;
  eraserMode: EraserMode;
  /** Eraser radius in screen px. */
  eraserSize: number;
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
  /** On-screen ruler (in px of `rulerHost`), or null when hidden. */
  ruler: Ruler | null;
  rulerHost: HTMLElement | null;
  /** Pages turned with two fingers (degrees, by page id); for this session only. */
  pageRotation: Record<string, number>;
  /** Angle shown while a page or the canvas is being turned. */
  rotationHint: number | null;
  /** Infinite canvas turn (mirrored here for the toolbar) and how to undo it. */
  canvasRotation: number;
  straightenCanvas: (() => void) | null;
  set: (patch: Partial<Omit<NoteEditorState, 'set'>>) => void;
}

export const useNoteEditor = create<NoteEditorState>()(
  persist(
    (set) => ({
      tool: 'pen',
      shape: 'line',
      textSize: 16,
      eraserMode: 'stroke',
      eraserSize: 10,
      selection: null,
      clipboard: null,
      editingTextId: null,
      currentPageId: null,
      insertTarget: null,
      fingerDraws: false,
      ruler: null,
      rulerHost: null,
      pageRotation: {},
      rotationHint: null,
      canvasRotation: 0,
      straightenCanvas: null,
      set: (patch) => set(patch.tool ? { selection: null, editingTextId: null, ...patch } : patch),
    }),
    { name: 'book-reader-notes', partialize: ({ tool, shape, textSize, eraserMode, eraserSize, fingerDraws }) => ({ tool, shape, textSize, eraserMode, eraserSize, fingerDraws }) },
  ),
);
