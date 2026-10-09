import { db, type Book } from '../../db/schema';
import { addBook } from '../../db/repo';
import { openEpub, readEpubInfo, sniffFormat } from '../../lib/epub';
import { getTitle, openPdf, renderThumbnail, sha256 } from '../../lib/pdf';

export type ImportResult = { status: 'added' | 'exists'; id: string; title: string } | { status: 'error'; name: string; error: string };

export const ACCEPTED_FILES = 'application/pdf,.pdf,application/epub+zip,.epub';
export const isBookFile = (f: File) => /\.(pdf|epub)$/i.test(f.name) || f.type === 'application/pdf' || f.type === 'application/epub+zip';

type Details = Pick<Book, 'format' | 'title' | 'author' | 'pageCount' | 'coverThumb'>;

async function pdfDetails(data: ArrayBuffer, name: string): Promise<Details> {
  const doc = await openPdf(data);
  try {
    return {
      format: 'pdf',
      title: await getTitle(doc, name),
      pageCount: doc.numPages,
      coverThumb: await renderThumbnail(doc).catch(() => undefined),
    };
  } finally {
    doc.destroy();
  }
}

async function epubDetails(data: ArrayBuffer, name: string): Promise<Details> {
  const book = openEpub(data);
  try {
    const info = await readEpubInfo(book, name);
    return { format: 'epub', title: info.title, author: info.author, pageCount: 0, coverThumb: info.coverThumb };
  } finally {
    book.destroy();
  }
}

/**
 * Books are keyed by content hash, so re-importing a file is detected and backups match across devices.
 * `title` overrides the file's own metadata, e.g. with the catalog title of a downloaded book.
 */
export async function importBook(file: File, opts: { title?: string; folderId?: string | null } = {}): Promise<ImportResult> {
  try {
    const data = await file.arrayBuffer();
    const format = sniffFormat(data, file.name);
    if (!format) throw new Error('Formato não suportado (use PDF ou EPUB)');
    const id = await sha256(data);
    const existing = await db.books.get(id);
    if (existing) return { status: 'exists', id, title: existing.title };

    const details = format === 'pdf' ? await pdfDetails(data, file.name) : await epubDetails(data, file.name);
    if (opts.title) details.title = opts.title;
    const now = Date.now();
    await addBook(
      { id, ...details, addedAt: now, lastOpenedAt: 0, lastPage: 1, zoom: 0, fileSize: file.size, folderId: opts.folderId ?? null },
      new Blob([data], { type: format === 'pdf' ? 'application/pdf' : 'application/epub+zip' }),
    );
    navigator.storage?.persist?.().catch(() => {});
    return { status: 'added', id, title: details.title };
  } catch (e) {
    return { status: 'error', name: file.name, error: e instanceof Error ? e.message : String(e) };
  }
}
