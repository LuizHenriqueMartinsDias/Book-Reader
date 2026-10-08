import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export { pdfjs };
export type { PDFDocumentProxy };

/** pdf.js renders 1 PDF point as 96/72 CSS px at "100%". */
export const CSS_UNITS = 96 / 72;

export async function openPdf(data: Blob | ArrayBuffer) {
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data.slice(0);
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
}

export async function sha256(data: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function renderThumbnail(doc: PDFDocumentProxy, width = 240) {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  page.cleanup();
  return canvas.toDataURL('image/webp', 0.8);
}

export async function getTitle(doc: PDFDocumentProxy, fallback: string) {
  try {
    const { info } = (await doc.getMetadata()) as { info?: { Title?: string } };
    const title = info?.Title?.trim();
    if (title && title.length > 1 && !/^untitled|\.(pdf|docx?)$/i.test(title)) return title;
  } catch {
    // metadata is optional
  }
  return fallback.replace(/\.pdf$/i, '');
}

export interface PageSize {
  width: number;
  height: number;
}

export interface OutlineItem {
  title: string;
  page: number | null;
  items: OutlineItem[];
}

export async function loadOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = await doc.getOutline();
  if (!outline) return [];
  const resolve = async (dest: unknown): Promise<number | null> => {
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(explicit)) return null;
      const ref = explicit[0];
      if (typeof ref === 'number') return ref + 1;
      return (await doc.getPageIndex(ref)) + 1;
    } catch {
      return null;
    }
  };
  const walk = (items: typeof outline): Promise<OutlineItem[]> =>
    Promise.all(
      items.map(async (it) => ({ title: it.title, page: await resolve(it.dest), items: await walk(it.items ?? []) })),
    );
  return walk(outline);
}

const textCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();

export async function getPageText(doc: PDFDocumentProxy, pageNumber: number) {
  let cache = textCache.get(doc);
  if (!cache) textCache.set(doc, (cache = new Map()));
  const hit = cache.get(pageNumber);
  if (hit !== undefined) return hit;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join('');
  cache.set(pageNumber, text);
  return text;
}
