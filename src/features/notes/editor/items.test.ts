import { beforeEach, describe, expect, it } from 'vitest';
import { addPage, createNotebook, getPages } from '../../../db/notes';
import { db, type StrokeItem, type TextItem } from '../../../db/schema';
import { useNoteHistory } from '../../../store/history';
import { cloneItems, commitStretch, commitTemplate } from './items';

describe('commitStretch', () => {
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

    await commitStretch(pages, { top: 20, right: 300, bottom: 0, left: 40 });
    const stretched = await getPages(nb.id);
    expect(stretched.map((p) => [p.width, p.height])).toEqual([[940, 820], [940, 820]]);
    expect(((await db.noteItems.get('s')) as StrokeItem).points[0]).toEqual([140, 220, 0.5]);

    await useNoteHistory.getState().undo();
    expect((await getPages(nb.id)).map((p) => [p.width, p.height, p.background?.margins])).toEqual([[600, 800, undefined], [600, 800, undefined]]);
    expect(((await db.noteItems.get('s')) as StrokeItem).points[0]).toEqual([100, 200, 0.5]);
  });

  it('stretches a plain page and keeps the writing on its lines', async () => {
    const nb = await createNotebook({ title: 'Caderno', kind: 'paged', paper: { style: 'lined', color: '#ffffff' }, coverColor: '#000' });
    const [page] = await getPages(nb.id);
    const text: TextItem = { id: 't', notebookId: nb.id, pageId: page.id, z: 1, createdAt: 0, type: 'text', x: 50, y: 84, w: 200, text: 'oi', fontSize: 16, color: '#000' };
    await db.noteItems.add(text);

    await commitStretch([page], { top: 56, right: 300, bottom: 0, left: 0 });
    expect((await getPages(nb.id)).map((p) => [p.width, p.height])).toEqual([[895, 898]]);
    expect(await db.noteItems.get('t')).toMatchObject({ x: 50, y: 140 });
  });

  it('copies writing along with its box, belonging to the copy', async () => {
    const box = { id: 'b', notebookId: 'n', pageId: 'p', z: 1, createdAt: 0, type: 'node' as const, shape: 'rect' as const, x: 0, y: 0, w: 100, h: 50, color: '#000', filled: false, width: 2, text: 'A', fontSize: 16 };
    const ink: StrokeItem = { id: 's', notebookId: 'n', pageId: 'p', z: 2, createdAt: 0, parentId: 'b', type: 'stroke', tool: 'pen', color: '#000', width: 2, points: [[10, 10, 0.5]] };
    const [boxCopy, inkCopy] = await cloneItems([box, ink], 'p', 20);
    expect(boxCopy.id).not.toBe('b');
    expect(inkCopy.parentId).toBe(boxCopy.id);
    const [alone] = await cloneItems([ink], 'p', 20);
    expect(alone.parentId).toBe('b');
  });

  it('puts a template under pages (at its size), new pages follow it, and it undoes', async () => {
    const nb = await createNotebook({ title: 'Planner', kind: 'paged', paper: { style: 'blank', color: '#ffffff' }, coverColor: '#000' });
    const [first] = await getPages(nb.id);
    const template = { id: 'cornell', name: 'Cornell', blob: new Blob([]), width: 595, height: 760, thumb: '', createdAt: 0 };

    await commitTemplate([first], template);
    expect(await getPages(nb.id)).toMatchObject([{ width: 595, height: 760, background: { template: 'cornell' } }]);
    await addPage(nb.id, 0);
    expect((await getPages(nb.id))[1]).toMatchObject({ width: 595, height: 760, background: { template: 'cornell' } });

    await useNoteHistory.getState().undo();
    expect((await getPages(nb.id))[0]).toMatchObject({ width: 595, height: 842 });
    expect((await getPages(nb.id))[0].background).toBeUndefined();
  });
});
