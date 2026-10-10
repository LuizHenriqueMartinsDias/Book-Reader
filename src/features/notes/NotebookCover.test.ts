import { beforeEach, describe, expect, it } from 'vitest';
import { createNotebook } from '../../db/notes';
import { db } from '../../db/schema';
import { coverDraft, saveCover } from './NotebookCover';

const notebook = () => createNotebook({ title: 'Cálculo', kind: 'paged', paper: { style: 'lined', color: '#fff' }, coverColor: '#1e3a8a' });
const picture = (text: string) => ({ blob: new Blob([text], { type: 'image/webp' }), width: 3, height: 4 });

describe('notebook covers', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('notebooks from before covers keep showing their first page; "Capa…" starts on the cover', async () => {
    const nb = await notebook();
    expect(nb.cover).toBeUndefined();
    expect(coverDraft(nb)).toEqual({ color: '#1e3a8a', pattern: 'plain', label: true, show: 'cover', image: null, imagePos: [50, 50] });
  });

  it('saves color, pattern, label and picture', async () => {
    const nb = await notebook();
    await saveCover(nb.id, { color: '#123456', pattern: 'leather', label: false, show: 'cover', image: picture('a'), imagePos: [20, 50] });
    const saved = (await db.notebooks.get(nb.id))!;
    expect(saved.coverColor).toBe('#123456');
    expect(saved.cover).toMatchObject({ pattern: 'leather', label: false, show: 'cover', imagePos: [20, 50] });
    const asset = (await db.noteAssets.get(saved.cover!.imageId!))!;
    expect(asset.notebookId).toBe(nb.id);
    expect(await asset.blob.text()).toBe('a');
  });

  it('drops the picture it replaces or removes, and keeps one left as is', async () => {
    const nb = await notebook();
    await saveCover(nb.id, { ...coverDraft(nb), image: picture('a') });
    let saved = (await db.notebooks.get(nb.id))!;
    const first = saved.cover!.imageId!;

    await saveCover(nb.id, { ...coverDraft(saved), pattern: 'dots' }, saved.cover);
    saved = (await db.notebooks.get(nb.id))!;
    expect(saved.cover!.imageId).toBe(first);
    expect(await db.noteAssets.count()).toBe(1);

    await saveCover(nb.id, { ...coverDraft(saved), image: picture('b') }, saved.cover);
    saved = (await db.notebooks.get(nb.id))!;
    expect(saved.cover!.imageId).not.toBe(first);
    expect(await db.noteAssets.get(first)).toBeUndefined();

    await saveCover(nb.id, { ...coverDraft(saved), image: null, imagePos: [10, 10] }, saved.cover);
    saved = (await db.notebooks.get(nb.id))!;
    expect(saved.cover!.imageId).toBeUndefined();
    expect(saved.cover!.imagePos).toBeUndefined();
    expect(await db.noteAssets.count()).toBe(0);
  });
});
