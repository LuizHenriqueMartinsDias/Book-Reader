import { db, type PageTemplate } from '../../db/schema';
import { newId } from '../../db/repo';
import { openPdf } from '../pdf';

/**
 * The user's page templates: a picture or the pages of a PDF, kept as pictures (what PDF export
 * can embed) and drawn under a notebook page, like an imported PDF page.
 */

/** A page made from a picture is A4-wide, in points; its height keeps the picture's shape. */
export const TEMPLATE_WIDTH = 595;
/** At most this many pages of a PDF become templates. */
export const MAX_TEMPLATE_PAGES = 20;
/** PDF pages are drawn at this many pixels per point (about 216 dpi). */
const PDF_SCALE = 3;
/** Pictures bigger than this (px, longer side) are shrunk. */
const MAX_PICTURE = 3600;

export function pictureSize(pxWidth: number, pxHeight: number) {
  return { width: TEMPLATE_WIDTH, height: Math.round(((TEMPLATE_WIDTH * pxHeight) / pxWidth) * 100) / 100 };
}

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível ler a imagem'))), type));

/** A small picture of a template, for choosing it. */
function thumbOf(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = Math.round((160 * height) / width);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.8);
}

async function fromPicture(file: File, name: string): Promise<PageTemplate> {
  const bitmap = await createImageBitmap(file);
  try {
    const k = Math.min(1, MAX_PICTURE / Math.max(bitmap.width, bitmap.height));
    let blob: Blob = file;
    // PNG and JPEG go in as they are; anything else (or too big) is redrawn as PNG.
    if (k < 1 || !['image/png', 'image/jpeg'].includes(file.type)) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await toBlob(canvas, 'image/png');
    }
    return { id: newId(), name, blob, ...pictureSize(bitmap.width, bitmap.height), thumb: thumbOf(bitmap, bitmap.width, bitmap.height), createdAt: Date.now() };
  } finally {
    bitmap.close();
  }
}

async function fromPdf(file: File, name: string): Promise<PageTemplate[]> {
  const doc = await openPdf(file);
  try {
    const count = Math.min(doc.numPages, MAX_TEMPLATE_PAGES);
    const out: PageTemplate[] = [];
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const { width, height } = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      out.push({
        id: newId(),
        name: count > 1 ? `${name} (p. ${i})` : name,
        blob: await toBlob(canvas, 'image/png'),
        width,
        height,
        thumb: thumbOf(canvas, width, height),
        createdAt: Date.now() + i,
      });
    }
    return out;
  } finally {
    doc.destroy();
  }
}

/** Adds templates from a picture, or from each page of a PDF; returns them. */
export async function importTemplates(file: File): Promise<PageTemplate[]> {
  const name = file.name.replace(/\.[^.]+$/, '') || 'Modelo';
  const templates = isPdfFile(file) ? await fromPdf(file, name) : [await fromPicture(file, name)];
  await db.pageTemplates.bulkAdd(templates);
  return templates;
}

export const renameTemplate = (id: string, name: string) => db.pageTemplates.update(id, { name });

/** Pages that used it keep their size and fall back to the notebook's paper. */
export const deleteTemplate = (id: string) => db.pageTemplates.delete(id);
