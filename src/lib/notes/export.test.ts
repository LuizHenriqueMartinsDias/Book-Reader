import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotebook, getPages } from '../../db/notes';
import { db, type NoteItem } from '../../db/schema';
import { exportNotebookPdf } from './export';

const paper = { style: 'lined' as const, color: '#ffffff' };
const base = { z: 1, createdAt: 0 };

async function withItems(kind: 'paged' | 'canvas', make: (notebookId: string, pageId: string) => NoteItem[]) {
  const nb = await createNotebook({ title: 'Teste', kind, paper, coverColor: '#000' });
  const [page] = await getPages(nb.id);
  await db.noteItems.bulkAdd(make(nb.id, page.id));
  return nb;
}

describe('exportNotebookPdf', () => {
  beforeEach(async () => {
    await Promise.all([db.notebooks.clear(), db.notePages.clear(), db.noteItems.clear()]);
  });

  it('writes A4 pages with ink, shapes and typed text (including accents)', async () => {
    const nb = await withItems('paged', (notebookId, pageId) => [
      { ...base, id: 's', notebookId, pageId, type: 'stroke', tool: 'pen', color: '#dc2626', width: 2, points: [[100, 100, 0.5], [200, 150, 0.5]] },
      { ...base, id: 'r', notebookId, pageId, type: 'shape', shape: 'arrow', x1: 50, y1: 300, x2: 250, y2: 300, color: '#2563eb', width: 2 },
      { ...base, id: 't', notebookId, pageId, type: 'text', x: 60, y: 400, w: 200, text: 'Função exponencial — revisão 🙂', fontSize: 16, color: '#111111' },
    ]);
    const out = await PDFDocument.load(await exportNotebookPdf(nb.id));
    expect(out.getPageCount()).toBe(1);
    expect(out.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(out.getTitle()).toBe('Teste');
  });

  it('fits an infinite canvas onto one page around its content', async () => {
    const nb = await withItems('canvas', (notebookId, pageId) => [
      { ...base, id: 's', notebookId, pageId, type: 'stroke', tool: 'pen', color: '#000000', width: 2, points: [[-500, -200, 0.5], [1500, 900, 0.5]] },
    ]);
    const size = (await PDFDocument.load(await exportNotebookPdf(nb.id))).getPage(0).getSize();
    expect(size.width).toBeCloseTo(2002 + 80, 0);
    expect(size.height).toBeCloseTo(1102 + 80, 0);
  });
});
