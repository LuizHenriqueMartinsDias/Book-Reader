import { degrees, PDFDocument, PDFName } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotebook, getPages } from '../../db/notes';
import { db, type NoteItem } from '../../db/schema';
import { exportNotebookPdf } from './export';

// fake-indexeddb can't keep Blobs, so the imported PDF comes from here instead of the database.
const sourcePdf = vi.hoisted(() => ({ bytes: new Uint8Array() as Uint8Array }));
vi.mock('../../db/repo', async (original) => ({
  ...(await original<typeof import('../../db/repo')>()),
  getBookFile: async () => ({ arrayBuffer: async () => sourcePdf.bytes.slice().buffer }),
}));

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

  it('draws diagram boxes with their text and arrows, under the ink', async () => {
    const nb = await withItems('paged', (notebookId, pageId) => [
      { ...base, id: 'n', notebookId, pageId, type: 'node', shape: 'diamond', x: 100, y: 100, w: 160, h: 100, color: '#2563eb', filled: true, width: 2, text: 'Decisão?\nsim ou não', fontSize: 14 },
      { ...base, id: 'r', notebookId, pageId, type: 'node', shape: 'round', x: 100, y: 300, w: 160, h: 60, color: '#000000', filled: false, width: 2, text: '', fontSize: 14 },
      { ...base, z: 2, id: 's', notebookId, pageId, parentId: 'r', type: 'stroke', tool: 'pen', color: '#000000', width: 2, points: [[120, 320, 0.5], [200, 340, 0.5]] },
      { ...base, z: 3, id: 'c', notebookId, pageId, type: 'connector', from: { node: 'n', x: 0, y: 0 }, to: { node: 'r', x: 0, y: 0 }, route: 'elbow', arrows: 'both', color: '#2563eb', width: 2, label: 'sim', fontSize: 12 },
      { ...base, z: 4, id: 'd', notebookId, pageId, type: 'connector', from: { node: 'n', x: 0, y: 0 }, to: { x: 400, y: 150 }, route: 'curve', arrows: 'end', color: '#000000', width: 2, label: '', fontSize: 12 },
    ]);
    const out = await PDFDocument.load(await exportNotebookPdf(nb.id));
    expect(out.getPageCount()).toBe(1);
  });

  it('draws post-its, open and folded', async () => {
    const nb = await withItems('paged', (notebookId, pageId) => [
      { ...base, id: 'a', notebookId, pageId, type: 'sticky', x: 300, y: 100, w: 150, h: 150, color: '#fef08a', text: 'Revisar o capítulo 3 antes da prova', fontSize: 14 },
      { ...base, id: 'b', notebookId, pageId, type: 'sticky', x: 300, y: 400, w: 150, h: 150, color: '#bfdbfe', text: 'escondido', fontSize: 14, collapsed: true },
      { ...base, z: 2, id: 'w', notebookId, pageId, parentId: 'a', type: 'stroke', tool: 'pen', color: '#000000', width: 2, points: [[320, 200, 0.5], [400, 210, 0.5]] },
    ]);
    expect((await PDFDocument.load(await exportNotebookPdf(nb.id))).getPageCount()).toBe(1);
  });

  it('fits an infinite canvas onto one page around its content', async () => {
    const nb = await withItems('canvas', (notebookId, pageId) => [
      { ...base, id: 's', notebookId, pageId, type: 'stroke', tool: 'pen', color: '#000000', width: 2, points: [[-500, -200, 0.5], [1500, 900, 0.5]] },
    ]);
    const size = (await PDFDocument.load(await exportNotebookPdf(nb.id))).getPage(0).getSize();
    expect(size.width).toBeCloseTo(2002 + 80, 0);
    expect(size.height).toBeCloseTo(1102 + 80, 0);
  });

  it('draws a stretched PDF page upright inside the bigger sheet', async () => {
    const src = await PDFDocument.create();
    const srcPage = src.addPage([600, 400]);
    srcPage.setRotation(degrees(90)); // shown as 400 × 600
    srcPage.drawText('Capítulo 1', { x: 50, y: 300 });
    src.addPage([600, 400]); // blank: nothing to embed
    sourcePdf.bytes = await src.save();
    const data = new Blob([], { type: 'application/pdf' });
    const nb = await createNotebook({ title: 'PDF', kind: 'paged', paper, coverColor: '#000', pdf: { data, pageSizes: [{ width: 400, height: 600 }, { width: 600, height: 400 }] } });
    const [page, blank] = await getPages(nb.id);
    await db.notePages.update(page.id, { width: 400 + 300, height: 600 + 50, background: { pdfPage: 1, margins: { top: 50, right: 300, bottom: 0, left: 0 } } });
    await db.notePages.update(blank.id, { width: 600 + 40, background: { pdfPage: 2, margins: { top: 0, right: 40, bottom: 0, left: 0 } } });

    const exported = await PDFDocument.load(await exportNotebookPdf(nb.id));
    expect(exported.getPage(1).getSize()).toEqual({ width: 640, height: 400 });
    const out = exported.getPage(0);
    expect(out.getSize()).toEqual({ width: 700, height: 650 });
    expect(out.getRotation().angle).toBe(0);
    const xobjects = out.node.Resources()!.lookup(PDFName.of('XObject'))!;
    expect(xobjects.toString()).toContain('EmbeddedPdfPage');
  });

  it('draws a page template under the page', async () => {
    // A 1×1 PNG.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    await db.pageTemplates.put({ id: 't', name: 'Cornell', blob: new Blob([png], { type: 'image/png' }), width: 595, height: 760, thumb: '', createdAt: 0 });
    const nb = await createNotebook({ title: 'Planner', kind: 'paged', paper, coverColor: '#000' });
    const [page] = await getPages(nb.id);
    await db.notePages.update(page.id, { width: 595 + 100, height: 760, background: { template: 't', margins: { top: 0, right: 100, bottom: 0, left: 0 } } });
    const out = (await PDFDocument.load(await exportNotebookPdf(nb.id))).getPage(0);
    expect(out.getSize()).toEqual({ width: 695, height: 760 });
    expect(out.node.Resources()!.lookup(PDFName.of('XObject'))!.toString()).toContain('Image');
  });
});
