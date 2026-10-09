import { create } from 'zustand';

export type Pane = 'reader' | 'notes';

/**
 * Book and notebook side by side: which pane was used last, so keyboard shortcuts go
 * there only. `notebookId` is the notebook open next to the book (for "send to notebook").
 */
export const useSplit = create<{ active: Pane | null; notebookId: string | null }>(() => ({ active: null, notebookId: null }));
