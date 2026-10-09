import { db, type Margins, type NoteItem, type NotePage } from '../../../db/schema';
import { newId } from '../../../db/repo';
import { touchNotebook } from '../../../db/notes';
import { transformItems } from '../../../lib/notes/geometry';
import { stretchPage } from '../../../lib/notes/margins';
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
  const ids = new Map(items.map((i) => [i.id, newId()]));
  // Writing copied with its box belongs to the copy of the box.
  return items.map((item, k) => {
    const copy = { ...shift(item), id: ids.get(item.id)!, pageId, z: z + 1 + k, createdAt: Date.now() };
    if (item.parentId && ids.has(item.parentId)) copy.parentId = ids.get(item.parentId);
    return copy;
  });
}

/** Stretches pages by `sides` (undoable; see `stretchPage`), moving their items along. */
export async function commitStretch(pages: NotePage[], sides: Margins) {
  const before: NotePage[] = [];
  const after: NotePage[] = [];
  const oldItems: NoteItem[] = [];
  const newItems: NoteItem[] = [];
  for (const page of pages) {
    const r = stretchPage(page, sides);
    if ((r.page.width === page.width && r.page.height === page.height && !r.dx && !r.dy)) continue;
    before.push(page);
    after.push(r.page);
    if (r.dx || r.dy) {
      const items = await db.noteItems.where('pageId').equals(page.id).toArray();
      oldItems.push(...items);
      newItems.push(...transformItems(items, { dx: r.dx, dy: r.dy, scale: 1, origin: [0, 0] }));
    }
  }
  if (!after.length) return;
  await useNoteHistory.getState().commit({ added: { notePages: after, noteItems: newItems }, removed: { notePages: before, noteItems: oldItems } });
  touchNotebook(pages[0].notebookId);
}
