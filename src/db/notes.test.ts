import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFolder, deleteFolder } from './folders';
import { addPage, createNotebook, deleteNotebook, deletePage, getPages, movePage, searchNotebooks } from './notes';
import { BookDB, db, type NoteItem } from './schema';

const paper = { style: 'lined' as const, color: '#ffffff' };

describe('database v2', () => {
  it('upgrades a v1 database without touching books and annotations', async () => {
    const name = 'migration-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ books: 'id, lastOpenedAt, addedAt', files: 'bookId', strokes: 'id, bookId, [bookId+page]', highlights: 'id, bookId, [bookId+page]', notes: 'id, bookId, [bookId+page], highlightId' });
    await v1.table('books').add({ id: 'b1', title: 'Livro' });
    await v1.table('strokes').add({ id: 's1', bookId: 'b1', page: 1 });
    v1.close();

    const reopened = new BookDB(name);
    await reopened.open();
    expect(await reopened.books.get('b1')).toMatchObject({ title: 'Livro' });
    expect(await reopened.strokes.count()).toBe(1);
    expect(await reopened.notebooks.count()).toBe(0);
    reopened.close();
  });
});

describe('notebooks', () => {
  beforeEach(async () => {
    await Promise.all([db.folders.clear(), db.notebooks.clear(), db.notePages.clear(), db.noteItems.clear(), db.files.clear()]);
  });

  it('creates a notebook with one A4 page, and pages from an imported PDF', async () => {
    const nb = await createNotebook({ title: 'Cálculo', kind: 'paged', paper, coverColor: '#000' });
    expect(await getPages(nb.id)).toMatchObject([{ order: 0, width: 595, height: 842 }]);

    const pdf = await createNotebook({
      title: 'Slides',
      kind: 'paged',
      paper,
      coverColor: '#000',
      pdf: { data: new Blob(['%PDF']), pageSizes: [{ width: 720, height: 540 }, { width: 720, height: 540 }] },
    });
    expect((await getPages(pdf.id)).map((p) => p.background?.pdfPage)).toEqual([1, 2]);
    expect(await db.files.get(pdf.id)).toBeTruthy();
  });

  it('inserts, moves and deletes pages keeping the order dense', async () => {
    const nb = await createNotebook({ title: 'x', kind: 'paged', paper, coverColor: '#000' });
    const [first] = await getPages(nb.id);
    const last = await addPage(nb.id);
    const middle = await addPage(nb.id, 0);
    expect((await getPages(nb.id)).map((p) => p.id)).toEqual([first.id, middle.id, last.id]);
    await movePage(last, -1);
    expect((await getPages(nb.id)).map((p) => p.id)).toEqual([first.id, last.id, middle.id]);
    await deletePage(first);
    expect((await getPages(nb.id)).map((p) => [p.id, p.order])).toEqual([
      [last.id, 0],
      [middle.id, 1],
    ]);
  });

  it('keeps notebooks when their folder is deleted, and deletes everything of a notebook', async () => {
    const folder = await createFolder('notebooks', 'História', '#f00');
    const nb = await createNotebook({ title: 'Revolução', kind: 'canvas', paper, coverColor: '#000', folderId: folder.id });
    await deleteFolder('notebooks', folder.id);
    expect((await db.notebooks.get(nb.id))?.folderId).toBeNull();
    await deleteNotebook(nb.id);
    expect(await db.notePages.where('notebookId').equals(nb.id).count()).toBe(0);
  });

  it('finds notebooks by title and by typed text', async () => {
    const a = await createNotebook({ title: 'Física', kind: 'paged', paper, coverColor: '#000' });
    const b = await createNotebook({ title: 'Outro', kind: 'paged', paper, coverColor: '#000' });
    const [page] = await getPages(b.id);
    await db.noteItems.add({ id: 't', notebookId: b.id, pageId: page.id, z: 1, createdAt: 0, type: 'text', x: 0, y: 0, w: 100, text: 'Leis de Newton', fontSize: 16, color: '#000' } as NoteItem);
    expect((await searchNotebooks('física')).map((n) => n.id)).toEqual([a.id]);
    expect((await searchNotebooks('newton')).map((n) => n.id)).toEqual([b.id]);
  });

  it('starts a notebook on a page template', async () => {
    const nb = await createNotebook({ title: 'Agenda', kind: 'paged', paper, coverColor: '#000', template: { id: 'semana', width: 595, height: 700 } });
    expect(await getPages(nb.id)).toMatchObject([{ width: 595, height: 700, background: { template: 'semana' } }]);
  });
});
