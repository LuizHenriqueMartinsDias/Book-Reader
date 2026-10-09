import { create } from 'zustand';
import { db, type Highlight, type NoteItem, type Stroke } from '../db/schema';

/** An undoable change: records that were added and records that were removed. */
export interface Change {
  added: { strokes?: Stroke[]; highlights?: Highlight[]; noteItems?: NoteItem[] };
  removed: { strokes?: Stroke[]; highlights?: Highlight[]; noteItems?: NoteItem[] };
}

interface HistoryState {
  undoStack: Change[];
  redoStack: Change[];
  /** Applies a change to the database and records it. */
  commit: (change: Change) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  reset: () => void;
}

const LIMIT = 200;

async function apply({ added, removed }: Change) {
  await db.transaction('rw', db.strokes, db.highlights, db.noteItems, async () => {
    // Removals first: an edit is "remove old version, add new one" with the same id.
    if (removed.strokes?.length) await db.strokes.bulkDelete(removed.strokes.map((s) => s.id));
    if (removed.highlights?.length) await db.highlights.bulkDelete(removed.highlights.map((h) => h.id));
    if (removed.noteItems?.length) await db.noteItems.bulkDelete(removed.noteItems.map((i) => i.id));
    if (added.strokes?.length) await db.strokes.bulkPut(added.strokes);
    if (added.highlights?.length) await db.highlights.bulkPut(added.highlights);
    if (added.noteItems?.length) await db.noteItems.bulkPut(added.noteItems);
  });
}

const invert = (c: Change): Change => ({ added: c.removed, removed: c.added });

/** Separate undo stacks, so the reader and a notebook open side by side don't undo each other. */
export function createHistory() {
  return create<HistoryState>((set, get) => ({
    undoStack: [],
    redoStack: [],
    commit: async (change) => {
      await apply(change);
      set((s) => ({ undoStack: [...s.undoStack, change].slice(-LIMIT), redoStack: [] }));
    },
    undo: async () => {
      const change = get().undoStack.at(-1);
      if (!change) return;
      await apply(invert(change));
      set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, change] }));
    },
    redo: async () => {
      const change = get().redoStack.at(-1);
      if (!change) return;
      await apply(change);
      set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, change] }));
    },
    reset: () => set({ undoStack: [], redoStack: [] }),
  }));
}

/** Book annotations (PDF ink and highlights). */
export const useHistory = createHistory();
/** The notebook being edited. */
export const useNoteHistory = createHistory();
