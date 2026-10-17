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

  it('round-trips the routine', async () => {
    await db.habits.add({ id: 'h', name: 'Água', icon: 'water', color: '#2563eb', kind: 'count', goal: 8, unit: 'copos', order: 1, createdAt: 1 });
    await db.habitLogs.add({ id: 'h|2026-10-10', habitId: 'h', date: '2026-10-10', value: 5, updatedAt: 1 });
    await db.dayOffs.add({ id: '2026-10-12' });
    await db.activity.add({ id: 'reading|2026-10-10', kind: 'reading', date: '2026-10-10', seconds: 1800 });
    const backup = await createBackup();
    await Promise.all(db.tables.map((t) => t.clear()));
    expect((await restoreBackup(backup)).habits).toBe(1);
    expect((await db.habitLogs.get('h|2026-10-10'))?.value).toBe(5);
    expect(await db.dayOffs.get('2026-10-12')).toBeTruthy();
    expect((await db.activity.get('reading|2026-10-10'))?.seconds).toBe(1800);
  });

  it("doesn't take back the routine done since the backup", async () => {
    await db.habitLogs.bulkAdd([
      { id: 'h|2026-10-10', habitId: 'h', date: '2026-10-10', value: 1, updatedAt: 10 },
      { id: 'h|2026-10-11', habitId: 'h', date: '2026-10-11', value: 1, updatedAt: 10 },
    ]);
    await db.activity.bulkAdd([
      { id: 'study|2026-10-10', kind: 'study', date: '2026-10-10', seconds: 600 },
      { id: 'study|2026-10-11', kind: 'study', date: '2026-10-11', seconds: 600 },
    ]);
    const backup = await createBackup();
    // Since the backup: more done on the 10th; the 11th lost on this device.
    await db.habitLogs.put({ id: 'h|2026-10-10', habitId: 'h', date: '2026-10-10', value: 3, updatedAt: 20 });
    await db.habitLogs.delete('h|2026-10-11');
    await db.activity.put({ id: 'study|2026-10-10', kind: 'study', date: '2026-10-10', seconds: 3600 });
    await db.activity.put({ id: 'study|2026-10-11', kind: 'study', date: '2026-10-11', seconds: 60 });
    await restoreBackup(backup);
    expect((await db.habitLogs.get('h|2026-10-10'))?.value).toBe(3);
    expect((await db.habitLogs.get('h|2026-10-11'))?.value).toBe(1);
    expect((await db.activity.get('study|2026-10-10'))?.seconds).toBe(3600);
    expect((await db.activity.get('study|2026-10-11'))?.seconds).toBe(600);
  });

  it('round-trips page templates with their pictures', async () => {
    await db.pageTemplates.add({ id: 't', name: 'Cornell', blob: new Blob(['png-bytes'], { type: 'image/png' }), width: 595, height: 842, thumb: 'data:', createdAt: 1 });
    const backup = await createBackup();
    await Promise.all(db.tables.map((t) => t.clear()));
    await restoreBackup(backup);
    const t = (await db.pageTemplates.get('t'))!;
    expect(t.name).toBe('Cornell');
    expect(new TextDecoder().decode(await t.blob.arrayBuffer())).toBe('png-bytes');
  });
});
