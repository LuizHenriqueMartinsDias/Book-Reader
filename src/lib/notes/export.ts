import { BlendMode, LineCapStyle, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { getPages } from '../../db/notes';
import { db, type NodeItem, type NoteItem, type Paper } from '../../db/schema';
import { getBookFile } from '../../db/repo';
import { userToDisplayMatrix, viewToUserSpace } from '../coords';
import { viewBoxOf } from '../export';
import { hexToRgb, MARKER_OPACITY, outlineToSvgPath, PENCIL_OPACITY, strokeOutline } from '../ink';
import { barbs, connectorPoints, heads, midpoint, nodesById } from './connectors';
import { nodeTextBox } from './diagram';
import { isSticky, STICKY_HEADER, STICKY_ICON, STICKY_INK } from './sticky';
import { bboxOf, nodeOutline, shapePoints, unionBox } from './geometry';
import { hasMargins, marginsOf, pdfBox } from './margins';
import { toPngBytes } from './images';
import { encodable, wrapText } from '../pdfText';
import { arrowHead, NODE_FILL_OPACITY, PAPER_SPACING } from './render';

type ToUser = (x: number, y: number) => [number, number];
const color = (hex: string) => rgb(...hexToRgb(hex));
const MARGIN = 40;

/**
 * Renders a notebook as a PDF: paper (vector), imported PDF pages as backgrounds, ink and shapes
 * as paths, typed text and images. An infinite canvas becomes one page fitted to its content.
 * `loadImage` turns a stored picture into PNG bytes (needs a browser canvas by default).
 */
export async function exportNotebookPdf(notebookId: string, loadImage: (blob: Blob) => Promise<Uint8Array> = toPngBytes) {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error('Caderno não encontrado');
  const pages = await getPages(notebookId);
  const doc = await PDFDocument.create();
  doc.setTitle(notebook.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sourceFile = notebook.hasPdf ? await getBookFile(notebookId) : undefined;
  const source = sourceFile ? await PDFDocument.load(await sourceFile.arrayBuffer(), { ignoreEncryption: true }) : null;

  // Each template's picture is embedded once, however many pages use it.
  const templates = new Map<string, Promise<PDFImage | null>>();
  const templateImage = (id: string) => {
    if (!templates.has(id))
      templates.set(
        id,
        db.pageTemplates.get(id).then(async (t) => {
          if (!t) return null;
          if (t.blob.type === 'image/png') return doc.embedPng(new Uint8Array(await t.blob.arrayBuffer()));
          if (t.blob.type === 'image/jpeg') return doc.embedJpg(new Uint8Array(await t.blob.arrayBuffer()));
          return doc.embedPng(await loadImage(t.blob));
        }),
      );
    return templates.get(id)!;
  };

  for (const page of pages) {
    const items = layered(await db.noteItems.where('pageId').equals(page.id).toArray());
    let out: PDFPage;
    let toUser: ToUser;

    if (notebook.kind === 'canvas') {
      const box = unionBox(items.map(bboxOf)) ?? { x: 0, y: 0, w: 595 - 2 * MARGIN, h: 842 - 2 * MARGIN };
      const w = box.w + 2 * MARGIN;
      const h = box.h + 2 * MARGIN;
      out = doc.addPage([w, h]);
      toUser = (x, y) => [x - box.x + MARGIN, h - (y - box.y + MARGIN)];
      drawPaper(out, notebook.paper, w, h);
    } else if (page.background?.pdfPage && source && hasMargins(marginsOf(page))) {
      // A stretched sheet: paper all over, the PDF page drawn upright inside it as a picture.
      const sourcePage = source.getPage(page.background.pdfPage - 1);
      const view = viewBoxOf(sourcePage);
      const [x1, y1, x2, y2] = view;
      out = doc.addPage([page.width, page.height]);
      toUser = (x, y) => [x, page.height - y];
      drawPaper(out, notebook.paper, page.width, page.height);
      const box = pdfBox(page);
      out.drawRectangle({ x: box.x, y: page.height - box.y - box.h, width: box.w, height: box.h, color: rgb(1, 1, 1) });
      // A blank PDF page has no content to embed (pdf-lib refuses it); the white box is all of it.
      if (sourcePage.node.Contents()) {
        const embedded = await doc.embedPage(sourcePage, { left: x1, bottom: y1, right: x2, top: y2 }, userToDisplayMatrix(view, sourcePage.getRotation().angle));
        out.drawPage(embedded, { x: box.x, y: page.height - box.y - box.h });
      }
    } else if (page.background?.pdfPage && source) {
      const [copied] = await doc.copyPages(source, [page.background.pdfPage - 1]);
      out = doc.addPage(copied);
      toUser = viewToUserSpace(viewBoxOf(out), out.getRotation().angle);
    } else {
      out = doc.addPage([page.width, page.height]);
      toUser = (x, y) => [x, page.height - y];
      drawPaper(out, notebook.paper, page.width, page.height);
      // A page template, where it sits on the sheet.
      const image = page.background?.template ? await templateImage(page.background.template) : null;
      if (image) {
        const box = pdfBox(page);
        out.drawImage(image, { x: box.x, y: page.height - box.y - box.h, width: box.w, height: box.h });
      }
    }

    const nodes = nodesById(items);
    for (const item of items) await drawItem(doc, out, font, item, toUser, loadImage, nodes, notebook.paper);
  }
  return doc.save();
}

/** Same stacking as on screen: images, diagram boxes and arrows, then ink and shapes, then text; by `z` within each. */
export function layered(items: NoteItem[]) {
  // Post-its lie over the ink, with what's written on them on top (as on screen); folded ones hide it.
  const stickies = new Map(items.filter(isSticky).map((s) => [s.id, s]));
  const onSticky = (i: NoteItem) => !!i.parentId && stickies.has(i.parentId);
  const layer = (i: NoteItem) =>
    i.type === 'image' ? 0 : i.type === 'node' ? 0.5 : i.type === 'connector' ? 0.75 : i.type === 'text' ? 2 : i.type === 'sticky' ? 1.5 : onSticky(i) ? 1.6 : 1;
  return [...items].filter((i) => !(i.parentId && stickies.get(i.parentId)?.collapsed)).sort((a, b) => layer(a) - layer(b) || a.z - b.z);
}

function drawPaper(page: PDFPage, paper: Paper, w: number, h: number) {
  if (paper.color.toLowerCase() !== '#ffffff') page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: color(paper.color) });
  const dark = hexToRgb(paper.color).reduce((a, b) => a + b, 0) < 1.3;
  const line = dark ? rgb(0.35, 0.35, 0.4) : rgb(0.78, 0.82, 0.92);
  if (paper.style === 'lined') {
    for (let y = PAPER_SPACING.lined * 3; y < h; y += PAPER_SPACING.lined) page.drawLine({ start: { x: 0, y: h - y }, end: { x: w, y: h - y }, thickness: 0.5, color: line });
  } else if (paper.style === 'grid') {
    const s = PAPER_SPACING.grid;
    for (let x = s; x < w; x += s) page.drawLine({ start: { x, y: 0 }, end: { x, y: h }, thickness: 0.4, color: line });
    for (let y = s; y < h; y += s) page.drawLine({ start: { x: 0, y: h - y }, end: { x: w, y: h - y }, thickness: 0.4, color: line });
  } else if (paper.style === 'dotted') {
    const s = PAPER_SPACING.dotted;
    for (let x = s; x < w; x += s) for (let y = s; y < h; y += s) page.drawCircle({ x, y: h - y, size: 0.7, color: line });
  }
}

async function drawItem(
  doc: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  item: NoteItem,
  toUser: ToUser,
  loadImage: (b: Blob) => Promise<Uint8Array>,
  nodes: Map<string, NodeItem>,
  paper: Paper,
) {
  // drawSvgPath flips y around the origin we give it, so pre-negate y to stay in user space.
  const map = (x: number, y: number) => {
    const [ux, uy] = toUser(x, y);
    return [ux, -uy];
  };
  const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => map(x, y).join(',')).join(' L')}`;

  switch (item.type) {
    case 'stroke': {
      const d = outlineToSvgPath(strokeOutline(item), map);
      if (d)
        page.drawSvgPath(d, {
          x: 0,
          y: 0,
          color: color(item.color),
          ...(item.tool === 'marker' ? { opacity: MARKER_OPACITY, blendMode: BlendMode.Multiply } : item.brush === 'pencil' ? { opacity: PENCIL_OPACITY } : {}),
        });
      return;
    }
    case 'shape': {
      const style = { x: 0, y: 0, borderColor: color(item.color), borderWidth: item.width, borderLineCap: LineCapStyle.Round };
      page.drawSvgPath(path(shapePoints(item).map(([x, y]) => [x, y])), style);
      if (item.shape === 'arrow') {
        const [a, b] = arrowHead(item);
        page.drawSvgPath(path([a, [item.x2, item.y2], b]), style);
      }
      return;
    }
    case 'text': {
      const size = item.fontSize;
      let y = item.y + 4 + size;
      for (const line of wrapText(item.text, font, size, item.w - 8)) {
        const [ux, uy] = toUser(item.x + 4, y - size * 0.22);
        page.drawText(line, { x: ux, y: uy, size, font, color: color(item.color) });
        y += size * 1.35;
      }
      return;
    }
    case 'node': {
      const d = `${path(nodeOutline(item))} Z`;
      if (item.filled) page.drawSvgPath(d, { x: 0, y: 0, color: color(item.color), opacity: NODE_FILL_OPACITY });
      page.drawSvgPath(d, { x: 0, y: 0, borderColor: color(item.color), borderWidth: item.width, borderLineCap: LineCapStyle.Round });
      // The text, wrapped and centered in the box like on screen.
      const size = item.fontSize;
      const box = nodeTextBox(item);
      const lines = item.text ? wrapText(item.text, font, size, box.w) : [];
      const lh = size * 1.3;
      let y = item.y + item.h / 2 - (lines.length * lh) / 2 + size * 0.95;
      for (const line of lines) {
        const [ux, uy] = toUser(item.x + item.w / 2 - font.widthOfTextAtSize(line, size) / 2, y);
        page.drawText(line, { x: ux, y: uy, size, font, color: color(item.color) });
        y += lh;
      }
      return;
    }
    case 'sticky': {
      const [x, y] = toUser(item.x, item.y + (item.collapsed ? STICKY_ICON : item.h));
      if (item.collapsed) {
        page.drawRectangle({ x, y, width: STICKY_ICON, height: STICKY_ICON, color: color(item.color), borderColor: rgb(0, 0, 0), borderOpacity: 0.25, borderWidth: 0.5 });
        return;
      }
      page.drawRectangle({ x, y, width: item.w, height: item.h, color: color(item.color), borderColor: rgb(0, 0, 0), borderOpacity: 0.15, borderWidth: 0.5 });
      const [hx, hy] = toUser(item.x, item.y + STICKY_HEADER);
      page.drawRectangle({ x: hx, y: hy, width: item.w, height: Math.min(STICKY_HEADER, item.h), color: rgb(0, 0, 0), opacity: 0.06 });
      const size = item.fontSize;
      let ty = item.y + STICKY_HEADER + 6 + size;
      for (const line of item.text ? wrapText(item.text, font, size, item.w - 12) : []) {
        const [lx, ly] = toUser(item.x + 6, ty);
        page.drawText(line, { x: lx, y: ly, size, font, color: color(STICKY_INK) });
        ty += size * 1.35;
      }
      return;
    }
    case 'connector': {
      const pts = connectorPoints(item, nodes);
      const style = { x: 0, y: 0, borderColor: color(item.color), borderWidth: item.width, borderLineCap: LineCapStyle.Round };
      page.drawSvgPath(path(pts), style);
      for (const [tip, from] of heads(item, pts)) {
        const [a, b] = barbs(tip, from, item.width);
        page.drawSvgPath(path([a, tip, b]), style);
      }
      if (item.label) {
        // On a patch of paper, so the line doesn't run through the text.
        const size = item.fontSize;
        const [mx, my] = midpoint(pts);
        const w = font.widthOfTextAtSize(item.label, size) + 8;
        const [rx, ry] = toUser(mx - w / 2, my + size * 0.7);
        page.drawRectangle({ x: rx, y: ry, width: w, height: size * 1.4, color: color(paper.color) });
        const [tx, ty] = toUser(mx - w / 2 + 4, my + size * 0.35);
        page.drawText(encodable(font, item.label), { x: tx, y: ty, size, font, color: color(item.color) });
      }
      return;
    }
    case 'image': {
      const asset = await db.noteAssets.get(item.assetId);
      if (!asset) return;
      const image = await doc.embedPng(await loadImage(asset.blob));
      const [ux, uy] = toUser(item.x, item.y + item.h);
      page.drawImage(image, { x: ux, y: uy, width: item.w, height: item.h });
      return;
    }
  }
}
