import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { inFolder } from '../features/FolderBar';
import { createBackup, restoreBackup } from '../lib/backup';
import { createFolder, deleteFolder } from './folders';
import { BookDB, db, type Book } from './schema';

const book = (id: string, folderId?: string | null): Book => ({
  id,
  title: id,
  pageCount: 1,
  addedAt: 0,
  lastOpenedAt: 0,
  lastPage: 1,
  zoom: 0,
  fileSize: 1,
  folderId,
});

describe('library folders', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('keeps books apart from notebook folders and keeps them when their folder is deleted', async () => {
    const folder = await createFolder('books', 'Faculdade', '#f00');
    await db.books.bulkAdd([book('a', folder.id), book('b')]);
    expect(await db.folders.count()).toBe(0);
    expect((await db.books.where('folderId').equals(folder.id).toArray()).map((b) => b.id)).toEqual(['a']);

    await deleteFolder('books', folder.id);
    expect(await db.bookFolders.count()).toBe(0);
    expect((await db.books.get('a'))?.folderId).toBeNull();
  });

  it('filters by folder, by "no folder", or not at all', () => {
    expect(inFolder('x', null)).toBe(true);
    expect(inFolder('x', 'x')).toBe(true);
    expect(inFolder('x', 'y')).toBe(false);
    expect(inFolder(undefined, '')).toBe(true);
    expect(inFolder('x', '')).toBe(false);
  });

  it('backs up the folders and which books are in them', async () => {
    const folder = await createFolder('books', 'Romances', '#0f0');
    await db.books.add(book('a', folder.id));
    const backup = await createBackup();
    await db.bookFolders.clear();
    await db.books.update('a', { folderId: null });

    await restoreBackup(backup);
    expect((await db.bookFolders.toArray()).map((f) => f.name)).toEqual(['Romances']);
    expect((await db.books.get('a'))?.folderId).toBe(folder.id);
  });

  it('upgrades a library saved before folders without losing anything', async () => {
    const old = new Dexie('upgrade-test');
    old.version(1).stores({ books: 'id, lastOpenedAt, addedAt', files: 'bookId', strokes: 'id, bookId, [bookId+page]', highlights: 'id, bookId, [bookId+page]', notes: 'id, bookId, [bookId+page], highlightId' });
    old.version(2).stores({ folders: 'id, order', notebooks: 'id, folderId, updatedAt, lastOpenedAt', notePages: 'id, notebookId, [notebookId+order]', noteItems: 'id, pageId, notebookId', noteAssets: 'id, notebookId' });
    await old.table('books').add(book('antigo'));
    await old.table('strokes').add({ id: 's', bookId: 'antigo', page: 1 });
    old.close();

    const upgraded = new BookDB('upgrade-test');
    expect((await upgraded.books.get('antigo'))?.title).toBe('antigo');
    expect(await upgraded.strokes.count()).toBe(1);
    expect(await upgraded.books.where('folderId').equals('x').count()).toBe(0);
    await upgraded.bookFolders.add({ id: 'f', name: 'Nova', color: '#000', order: 1, createdAt: 0 });
    upgraded.close();
  });
});
