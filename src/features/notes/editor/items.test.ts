import { beforeEach, describe, expect, it } from 'vitest';
import { createNotebook, getPages } from '../../../db/notes';
import { db, type StrokeItem } from '../../../db/schema';
import { useNoteHistory } from '../../../store/history';
import { commitMargins } from './items';

describe('commitMargins', () => {
  beforeEach(async () => {
    await Promise.all([db.notebooks.clear(), db.notePages.clear(), db.noteItems.clear()]);
    useNoteHistory.getState().reset();
  });

  it('stretches PDF pages, keeps ink on the same spot of the PDF, and undoes as one step', async () => {
    const data = new Blob(['%PDF'], { type: 'application/pdf' });
    const nb = await createNotebook({ title: 'PDF', kind: 'paged', paper: { style: 'blank', color: '#ffffff' }, coverColor: '#000', pdf: { data, pageSizes: [{ width: 600, height: 800 }, { width: 600, height: 800 }] } });
    const pages = await getPages(nb.id);
    const stroke: StrokeItem = { id: 's', notebookId: nb.id, pageId: pages[0].id, z: 1, createdAt: 0, type: 'stroke', tool: 'pen', color: '#000', width: 2, points: [[100, 200, 0.5]] };
    await db.noteItems.add(stroke);

    await commitMargins(pages, { top: 20, right: 300, bottom: 0, left: 40 });
    const stretched = await getPages(nb.id);
    expect(stretched.map((p) => [p.width, p.height])).toEqual([[940, 820], [940, 820]]);
    expect(((await db.noteItems.get('s')) as StrokeItem).points[0]).toEqual([140, 220, 0.5]);

    await useNoteHistory.getState().undo();
    expect((await getPages(nb.id)).map((p) => [p.width, p.height, p.background?.margins])).toEqual([[600, 800, undefined], [600, 800, undefined]]);
    expect(((await db.noteItems.get('s')) as StrokeItem).points[0]).toEqual([100, 200, 0.5]);
  });
});
