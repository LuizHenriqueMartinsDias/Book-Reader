import { beforeEach, describe, expect, it } from 'vitest';
import { createNotebook, getPages } from '../db/notes';
import { db, type NoteItem } from '../db/schema';
import { createBackup, restoreBackup } from './backup';

describe('backup', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('round-trips notebooks with their pictures and imported PDF', async () => {
    const nb = await createNotebook({
      title: 'Slides',
      kind: 'paged',
      paper: { style: 'blank', color: '#ffffff' },
      coverColor: '#000',
      pdf: { data: new Blob(['%PDF-1.4 fake']), pageSizes: [{ width: 720, height: 540 }] },
    });
    const [page] = await getPages(nb.id);
    await db.noteAssets.add({ id: 'a', notebookId: nb.id, blob: new Blob(['img']), width: 1, height: 1 });
    await db.noteItems.add({ id: 'i', notebookId: nb.id, pageId: page.id, z: 1, createdAt: 0, type: 'image', x: 0, y: 0, w: 10, h: 10, assetId: 'a' } as NoteItem);

    const backup = await createBackup();
    await Promise.all(db.tables.map((t) => t.clear()));
    const result = await restoreBackup(backup);

    expect(result.notebooks).toBe(1);
    expect(await db.notePages.count()).toBe(1);
    expect(new TextDecoder().decode(await (await db.noteAssets.get('a'))!.blob.arrayBuffer())).toBe('img');
    expect(new TextDecoder().decode(await (await db.files.get(nb.id))!.data.arrayBuffer())).toBe('%PDF-1.4 fake');
  });
});
