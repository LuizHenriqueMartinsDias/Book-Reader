import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Highlight, Note, Stroke } from '../db/schema';
import { exportAnnotatedPdf } from './export';

async function samplePdf(rotation = 0) {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]).setRotation(degrees(rotation));
  doc.addPage([600, 800]);
  return (await doc.save()).buffer as ArrayBuffer;
}

const stroke: Stroke = {
  id: 's1',
  bookId: 'b',
  page: 1,
  tool: 'pen',
  color: '#dc2626',
  width: 2,
  points: [
    [100, 100, 0.5],
    [150, 120, 0.5],
    [200, 110, 0.5],
  ],
  createdAt: 1,
};
const highlight: Highlight = { id: 'h1', bookId: 'b', page: 1, color: '#facc15', rects: [[50, 700, 200, 14]], text: 'x', createdAt: 1 };
const note: Note = { id: 'n1', bookId: 'b', page: 1, highlightId: 'h1', body: 'Ótima ideia', createdAt: 1, updatedAt: 1 };

function pageContent(doc: PDFDocument, index: number) {
  const contents = doc.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => doc.context.lookup(ref))
    .map((s) => (s instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(s).decode()) : String(s)))
    .join('\n');
}

describe('exportAnnotatedPdf', () => {
  it('draws ink and highlights and adds notes as text annotations', async () => {
    const bytes = await exportAnnotatedPdf(await samplePdf(), { strokes: [stroke], highlights: [highlight], notes: [note] });
    const out = await PDFDocument.load(bytes);

    const content = pageContent(out, 0);
    expect(content).toMatch(/0\.86\d* 0\.14\d* 0\.14\d* rg/); // stroke color #dc2626
    expect(content).toMatch(/1 0\.8\d* 0\.08\d* rg/); // highlight color #facc15
    // Highlight top-left (50, 700) in view space is (50, 100) in user space.
    expect(content).toContain('50 -100');

    const annots = out.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    const annot = out.context.lookup(annots!.get(0), PDFDict);
    expect(annot.get(PDFName.of('Subtype'))).toEqual(PDFName.of('Text'));
    expect(annot.lookup(PDFName.of('Contents'))?.toString()).toContain('FEFF'); // UTF-16 for "Ó"

    expect(out.getPage(1).node.Annots()).toBeUndefined();
  });

  it('places annotations by the displayed orientation of rotated pages', async () => {
    const bytes = await exportAnnotatedPdf(await samplePdf(90), { strokes: [], highlights: [highlight], notes: [] });
    // Rotated 90°: view (50, 700) -> user (x1 + vy, y1 + vx) = (700, 50)
    expect(pageContent(await PDFDocument.load(bytes), 0)).toContain('700 -50');
  });
});
