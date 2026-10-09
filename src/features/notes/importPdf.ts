import { COVER_COLORS, createNotebook } from '../../db/notes';
import { openPdf } from '../../lib/pdf';

/** Makes a notebook whose pages are the PDF's pages, to write over them. */
export async function notebookFromPdf(data: Blob, title: string, opts: { folderId?: string | null; sourceBookId?: string } = {}) {
  const doc = await openPdf(data);
  try {
    const pageSizes = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { width, height } = (await doc.getPage(i)).getViewport({ scale: 1 });
      pageSizes.push({ width, height });
    }
    return await createNotebook({
      title,
      kind: 'paged',
      paper: { style: 'blank', color: '#ffffff' },
      coverColor: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
      folderId: opts.folderId,
      sourceBookId: opts.sourceBookId,
      pdf: { data, pageSizes },
    });
  } finally {
    doc.destroy();
  }
}
