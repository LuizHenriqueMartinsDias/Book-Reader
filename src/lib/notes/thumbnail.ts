import { db, type NoteItem, type Notebook, type NotePage } from '../../db/schema';
import { bboxOf, unionBox } from './geometry';
import { drawItems, PAPER_SPACING, paperInk } from './render';

/** Small picture of a page (or of a canvas' content) for the notebook's cover. */
export async function renderThumbnail(notebook: Notebook, page: NotePage, items: NoteItem[], width = 240) {
  const area =
    notebook.kind === 'canvas' ? (unionBox(items.map(bboxOf)) ?? { x: 0, y: 0, w: 595, h: 842 }) : { x: 0, y: 0, w: page.width, h: page.height };
  // Canvas content gets a margin and a portrait-ish frame so covers line up.
  const frameH = notebook.kind === 'canvas' ? Math.max(area.h, area.w * 1.2) + 40 : area.h;
  const frameW = notebook.kind === 'canvas' ? area.w + 40 : area.w;
  const k = width / frameW;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(frameH * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = notebook.paper.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = notebook.kind === 'canvas' ? 20 - area.x : 0;
  const oy = notebook.kind === 'canvas' ? 20 - area.y : 0;
  if (notebook.kind === 'paged' && notebook.paper.style === 'lined') {
    ctx.strokeStyle = paperInk(notebook.paper);
    for (let y = PAPER_SPACING.lined * 3; y < frameH; y += PAPER_SPACING.lined) {
      ctx.beginPath();
      ctx.moveTo(0, y * k);
      ctx.lineTo(canvas.width, y * k);
      ctx.stroke();
    }
  }
  ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
  // Same stacking as the editor: images, then text, then ink.
  for (const img of items.sort((a, b) => a.z - b.z)) {
    if (img.type !== 'image') continue;
    const asset = await db.noteAssets.get(img.assetId);
    if (!asset) continue;
    try {
      const bitmap = await createImageBitmap(asset.blob);
      ctx.drawImage(bitmap, img.x, img.y, img.w, img.h);
      bitmap.close();
    } catch {
      // unreadable picture: leave it out of the cover
    }
  }
  for (const t of items) {
    if (t.type !== 'text') continue;
    ctx.fillStyle = t.color;
    ctx.font = `${t.fontSize}px system-ui, sans-serif`;
    t.text.split('\n').forEach((line, i) => ctx.fillText(line, t.x + 4, t.y + t.fontSize * (1 + i * 1.35)));
  }
  drawItems(ctx, items);
  return canvas.toDataURL('image/webp', 0.75);
}
