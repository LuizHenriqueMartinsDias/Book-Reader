import { BlendMode, PDFDocument, PDFHexString, PDFName, PDFString, rgb } from 'pdf-lib';
import type { Highlight, Note, Stroke } from '../db/schema';
import { viewToUserSpace, type ViewBox } from './coords';
import { hexToRgb, MARKER_OPACITY, outlineToSvgPath, strokeOutline } from './ink';

const HIGHLIGHT_OPACITY = 0.4;

export interface Annotations {
  strokes: Stroke[];
  highlights: Highlight[];
  notes: Note[];
}

/**
 * Burns highlights and ink into the page content and adds notes as standard PDF text
 * annotations (the sticky-note icon other readers show), returning the new file bytes.
 */
export async function exportAnnotatedPdf(source: ArrayBuffer, { strokes, highlights, notes }: Annotations) {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true });
  const pages = doc.getPages();

  pages.forEach((page, i) => {
    const n = i + 1;
    const toUser = viewToUserSpace(viewBoxOf(page), page.getRotation().angle);
    // drawSvgPath flips y around the origin we give it, so pre-negate y to stay in user space.
    const map = (x: number, y: number) => {
      const [ux, uy] = toUser(x, y);
      return [ux, -uy];
    };

    for (const h of highlights.filter((h) => h.page === n)) {
      const [r, g, b] = hexToRgb(h.color);
      for (const [x, y, w, hh] of h.rects) {
        const corners = [map(x, y), map(x + w, y), map(x + w, y + hh), map(x, y + hh)];
        const d = `M${corners.map((c) => c.join(',')).join(' L')} Z`;
        page.drawSvgPath(d, { x: 0, y: 0, color: rgb(r, g, b), opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply });
      }
    }

    for (const s of strokes.filter((s) => s.page === n).sort((a, b) => a.createdAt - b.createdAt)) {
      const d = outlineToSvgPath(strokeOutline(s), map);
      if (!d) continue;
      const [r, g, b] = hexToRgb(s.color);
      page.drawSvgPath(d, {
        x: 0,
        y: 0,
        color: rgb(r, g, b),
        ...(s.tool === 'marker' ? { opacity: MARKER_OPACITY, blendMode: BlendMode.Multiply } : {}),
      });
    }

    notes
      .filter((note) => note.page === n && note.body.trim())
      .forEach((note, k) => {
        const anchor = highlights.find((h) => h.id === note.highlightId)?.rects[0];
        const [ux, uy] = toUser(anchor ? Math.max(0, anchor[0] - 22) : 6, anchor ? anchor[1] : 6 + k * 24);
        const annot = doc.context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [ux, uy - 20, ux + 20, uy],
          Contents: PDFHexString.fromText(note.body),
          T: PDFHexString.fromText('Book Reader'),
          M: PDFString.fromDate(new Date(note.updatedAt)),
          Name: PDFName.of('Comment'),
          C: [1, 0.8, 0.2],
          F: 4,
          Open: false,
        });
        page.node.addAnnot(doc.context.register(annot));
      });
  });

  return doc.save();
}

/** pdf.js displays the crop box clipped to the media box; mirror that. */
function viewBoxOf(page: ReturnType<PDFDocument['getPages']>[number]): ViewBox {
  const m = page.getMediaBox();
  const c = page.getCropBox();
  const x1 = Math.max(m.x, c.x);
  const y1 = Math.max(m.y, c.y);
  const x2 = Math.min(m.x + m.width, c.x + c.width);
  const y2 = Math.min(m.y + m.height, c.y + c.height);
  return x2 > x1 && y2 > y1 ? [x1, y1, x2, y2] : [m.x, m.y, m.x + m.width, m.y + m.height];
}
