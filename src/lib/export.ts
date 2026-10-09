import { BlendMode, degrees, PDFDocument, PDFHexString, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { BOOK_STICKY, STICKY_COLORS, STICKY_HEADER, STICKY_INK } from './notes/sticky';
import { wrapText } from './pdfText';
import type { Highlight, Note, Stroke } from '../db/schema';
import { viewToUserSpace, type ViewBox } from './coords';
import { hexToRgb, MARKER_OPACITY, outlineToSvgPath, PENCIL_OPACITY, strokeOutline } from './ink';

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
  const font = notes.some((n) => n.pin && !n.collapsed) ? await doc.embedFont(StandardFonts.Helvetica) : null;

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
        ...(s.tool === 'marker' ? { opacity: MARKER_OPACITY, blendMode: BlendMode.Multiply } : s.brush === 'pencil' ? { opacity: PENCIL_OPACITY } : {}),
      });
    }

    // Open post-its are drawn on the page as they look (paper, text, handwriting).
    for (const note of notes.filter((note) => note.page === n && note.pin && !note.collapsed)) drawPostit(page, note, toUser, map, font!, page.getRotation().angle);

    // Other notes (and folded post-its) become standard PDF notes.
    notes
      .filter((note) => note.page === n && note.body.trim() && !(note.pin && !note.collapsed))
      .forEach((note, k) => {
        // A post-it goes where it's stuck, in its color; other notes beside their highlight or at the top.
        const anchor = highlights.find((h) => h.id === note.highlightId)?.rects[0];
        const [ux, uy] = note.pin
          ? toUser(note.pin.x, note.pin.y)
          : toUser(anchor ? Math.max(0, anchor[0] - 22) : 6, anchor ? anchor[1] : 6 + k * 24);
        const annot = doc.context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [ux, uy - 20, ux + 20, uy],
          Contents: PDFHexString.fromText(note.body),
          T: PDFHexString.fromText('Book Reader'),
          M: PDFString.fromDate(new Date(note.updatedAt)),
          Name: PDFName.of('Comment'),
          C: note.color ? hexToRgb(note.color) : [1, 0.8, 0.2],
          F: 4,
          Open: !!note.pin && !note.collapsed,
        });
        page.node.addAnnot(doc.context.register(annot));
      });
  });

  return doc.save();
}

/** pdf.js displays the crop box clipped to the media box; mirror that. */
export function viewBoxOf(page: ReturnType<PDFDocument['getPages']>[number]): ViewBox {
  const m = page.getMediaBox();
  const c = page.getCropBox();
  const x1 = Math.max(m.x, c.x);
  const y1 = Math.max(m.y, c.y);
  const x2 = Math.min(m.x + m.width, c.x + c.width);
  const y2 = Math.min(m.y + m.height, c.y + c.height);
  return x2 > x1 && y2 > y1 ? [x1, y1, x2, y2] : [m.x, m.y, m.x + m.width, m.y + m.height];
}

/** An open post-it drawn on a page: its paper and strip, its text, its handwriting. */
function drawPostit(page: PDFPage, note: Note, toUser: (x: number, y: number) => [number, number], map: (x: number, y: number) => number[], font: PDFFont, rotation: number) {
  const { x, y, w, h } = note.pin!;
  const box = (bx: number, by: number, bw: number, bh: number, style: Parameters<PDFPage['drawRectangle']>[0]) => {
    const [ax, ay] = toUser(bx, by);
    const [cx, cy] = toUser(bx + bw, by + bh);
    page.drawRectangle({ x: Math.min(ax, cx), y: Math.min(ay, cy), width: Math.abs(cx - ax), height: Math.abs(cy - ay), ...style });
  };
  box(x, y, w, h, { color: rgb(...hexToRgb(note.color ?? STICKY_COLORS[0])), borderColor: rgb(0, 0, 0), borderOpacity: 0.15, borderWidth: 0.5 });
  box(x, y, w, Math.min(STICKY_HEADER, h), { color: rgb(0, 0, 0), opacity: 0.06 });
  const size = BOOK_STICKY.fontSize;
  let ty = y + STICKY_HEADER + 3 + size;
  for (const line of note.body.trim() ? wrapText(note.body, font, size, w - 12) : []) {
    const [ux, uy] = toUser(x + 6, ty);
    page.drawText(line, { x: ux, y: uy, size, font, color: rgb(...hexToRgb(STICKY_INK)), rotate: degrees(rotation) });
    ty += size * 1.35;
  }
  for (const s of note.ink ?? []) {
    const d = outlineToSvgPath(strokeOutline({ ...s, points: s.points.map(([px, py, p]) => [x + px, y + py, p]) }), map);
    if (d) page.drawSvgPath(d, { x: 0, y: 0, color: rgb(...hexToRgb(s.color)), ...(s.tool === 'marker' ? { opacity: MARKER_OPACITY, blendMode: BlendMode.Multiply } : s.brush === 'pencil' ? { opacity: PENCIL_OPACITY } : {}) });
  }
}
