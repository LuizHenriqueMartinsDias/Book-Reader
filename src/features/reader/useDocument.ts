import { useEffect, useState } from 'react';
import { db, type Book } from '../../db/schema';
import { getBookFile } from '../../db/repo';
import { openPdf, type PageSize, type PDFDocumentProxy } from '../../lib/pdf';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; book: Book; doc: PDFDocumentProxy; sizes: PageSize[] };

/** Opens a stored book. Page sizes start as page 1's and are filled in from the PDF in the background. */
export function useDocument(bookId: string) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    (async () => {
      const [book, file] = await Promise.all([db.books.get(bookId), getBookFile(bookId)]);
      if (!book || !file) throw new Error('Livro não encontrado na biblioteca.');
      doc = await openPdf(file);
      if (cancelled) return doc.destroy();
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const sizes: PageSize[] = Array.from({ length: doc.numPages }, () => ({ width: first.width, height: first.height }));
      setState({ status: 'ready', book, doc, sizes });

      const all = [...sizes];
      let differs = false;
      for (let i = 2; i <= doc.numPages && !cancelled; i++) {
        const { width, height } = (await doc.getPage(i)).getViewport({ scale: 1 });
        if (width !== first.width || height !== first.height) differs = true;
        all[i - 1] = { width, height };
      }
      if (!cancelled && differs) setState({ status: 'ready', book, doc, sizes: all });
    })().catch((e) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));

    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [bookId]);

  return state;
}
