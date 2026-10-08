import { db } from '../../db/schema';
import { addBook } from '../../db/repo';
import { getTitle, openPdf, renderThumbnail, sha256 } from '../../lib/pdf';

export type ImportResult = { status: 'added' | 'exists'; id: string; title: string } | { status: 'error'; name: string; error: string };

/** Books are keyed by content hash, so re-importing a file is detected and backups match across devices. */
export async function importBook(file: File): Promise<ImportResult> {
  try {
    const data = await file.arrayBuffer();
    const id = await sha256(data);
    const existing = await db.books.get(id);
    if (existing) return { status: 'exists', id, title: existing.title };

    const doc = await openPdf(data);
    try {
      const title = await getTitle(doc, file.name);
      const now = Date.now();
      await addBook(
        {
          id,
          title,
          pageCount: doc.numPages,
          coverThumb: await renderThumbnail(doc).catch(() => undefined),
          addedAt: now,
          lastOpenedAt: 0,
          lastPage: 1,
          zoom: 0,
          fileSize: file.size,
        },
        new Blob([data], { type: 'application/pdf' }),
      );
      navigator.storage?.persist?.().catch(() => {});
      return { status: 'added', id, title };
    } finally {
      doc.destroy();
    }
  } catch (e) {
    return { status: 'error', name: file.name, error: e instanceof Error ? e.message : String(e) };
  }
}
