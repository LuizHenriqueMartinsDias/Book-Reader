import { db, type NoteItem } from '../../../db/schema';
import { newId } from '../../../db/repo';
import { touchNotebook } from '../../../db/notes';
import { useNoteHistory } from '../../../store/history';

/** Saves a change to notebook items through the undo history and marks the notebook edited. */
export async function commitItems(added: NoteItem[], removed: NoteItem[] = []) {
  if (!added.length && !removed.length) return;
  await useNoteHistory.getState().commit({ added: { noteItems: added }, removed: { noteItems: removed } });
  const notebookId = (added[0] ?? removed[0]).notebookId;
  touchNotebook(notebookId);
}

/** Copies of items with fresh ids on `pageId`, stacked on top and nudged by `offset`. */
export async function cloneItems(items: NoteItem[], pageId: string, offset: number): Promise<NoteItem[]> {
  const z = (await db.noteItems.where('pageId').equals(pageId).toArray()).reduce((m, i) => Math.max(m, i.z), 0);
  const shift = <T extends NoteItem>(i: T): T => {
    switch (i.type) {
      case 'stroke':
        return { ...i, points: i.points.map(([x, y, p]) => [x + offset, y + offset, p]) };
      case 'shape':
        return { ...i, x1: i.x1 + offset, y1: i.y1 + offset, x2: i.x2 + offset, y2: i.y2 + offset };
      default:
        return { ...i, x: (i as { x: number }).x + offset, y: (i as { y: number }).y + offset };
    }
  };
  return items.map((item, k) => ({ ...shift(item), id: newId(), pageId, z: z + 1 + k, createdAt: Date.now() }));
}
