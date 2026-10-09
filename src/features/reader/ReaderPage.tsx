import { useCallback, useEffect, useState } from 'react';
import { db, type Book, type BookFormat } from '../../db/schema';
import { updateBook } from '../../db/repo';
import { CSS_UNITS, type PageSize, type PDFDocumentProxy } from '../../lib/pdf';
import { useHistory } from '../../store/history';
import { useUi, type Tool } from '../../store/ui';
import { useSplit } from '../split/splitStore';
import { useReader } from './readerStore';
import SelectionMenu from './SelectionMenu';
import Sidebar from './Sidebar';
import Toolbar from './Toolbar';
import EpubReader from '../epub/EpubReader';
import FullscreenChrome from './FullscreenChrome';
import { useDocument } from './useDocument';
import { useFullscreen } from './useFullscreen';
import PagedView from './views/PagedView';
import ScrollView from './views/ScrollView';
import { MAX_ZOOM, MIN_ZOOM, type ZoomChange, type ZoomMode } from './views/types';

/** Where to open a book instead of the last-read spot (links from notebook quotes). */
export interface StartAt {
  page?: number;
  cfi?: string;
}

export default function ReaderPage({ bookId, startAt = {} }: { bookId: string; startAt?: StartAt }) {
  const [format, setFormat] = useState<BookFormat | null | 'missing'>(null);
  useEffect(() => {
    db.books.get(bookId).then((b) => setFormat(b ? (b.format ?? 'pdf') : 'missing'));
  }, [bookId]);
  if (format === null) return <div className="p-8 text-[var(--muted)]">Abrindo livro…</div>;
  return format === 'epub' ? <EpubReader bookId={bookId} startCfi={startAt.cfi} /> : <PdfReader bookId={bookId} startPage={startAt.page} />;
}

function PdfReader({ bookId, startPage }: { bookId: string; startPage?: number }) {
  const state = useDocument(bookId);

  if (state.status === 'loading') return <div className="p-8 text-[var(--muted)]">Abrindo livro…</div>;
  if (state.status === 'error')
    return (
      <div className="p-8">
        <p className="mb-4">{state.message}</p>
        <a href="#/" className="text-amber-600 underline">
          Voltar à estante
        </a>
      </div>
    );
  return <Reader book={state.book} doc={state.doc} sizes={state.sizes} startPage={startPage} />;
}

const TOOL_KEYS: Record<string, Tool> = { v: 'select', p: 'pen', h: 'marker', e: 'eraser', n: 'sticky' };

/** Shared chrome around the active view: toolbar, sidebar, zoom, keyboard and persistence. */
function Reader({ book, doc, sizes, startPage }: { book: Book; doc: PDFDocumentProxy; sizes: PageSize[]; startPage?: number }) {
  // Seed the per-book store before any child renders, so views open on the last-read page.
  useState(() => {
    const page = startPage && startPage <= sizes.length ? startPage : book.lastPage;
    useReader.setState({ bookId: book.id, format: 'pdf', doc, epub: null, currentPage: page, currentCfi: null, focusNoteId: null });
    useHistory.getState().reset();
  });

  // Each way of reading keeps its own zoom: "fit" means the page width when scrolling but the
  // whole page when turning pages, so one zoom can't serve both. Scrolling keeps a zoom relative
  // to 100%; paged views a multiple of their fit size (which changes when the tablet turns).
  const [zooms, setZooms] = useState<{ scroll: ZoomMode; paged: ZoomMode }>({
    scroll: book.zoom > 0 ? book.zoom : null,
    paged: (book.pagedZoomFactor ?? 0) > 0 ? book.pagedZoomFactor! : null,
  });
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const viewMode = useUi((s) => s.viewMode);
  const modeKey = viewMode === 'scroll' ? 'scroll' : 'paged';
  const zoom = zooms[modeKey];
  const currentPage = useReader((s) => s.currentPage);
  const scale = useReader((s) => s.scale);
  const fullscreen = useFullscreen();

  useEffect(() => {
    useReader.setState({ doc });
    updateBook(book.id, { lastOpenedAt: Date.now() });
    document.title = `${book.title} · Book Reader`;
    return () => {
      document.title = 'Book Reader';
      useReader.setState({ doc: null });
    };
  }, [book, doc]);

  useEffect(() => {
    const t = setTimeout(() => updateBook(book.id, { lastPage: currentPage }), 500);
    return () => clearTimeout(t);
  }, [book.id, currentPage]);

  const changeZoom = useCallback((next: ZoomChange) => {
    const value = typeof next === 'function' ? next(useReader.getState().scale / CSS_UNITS) : next;
    const clamped = value === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
    if (useUi.getState().viewMode === 'scroll') return setZooms((z) => ({ ...z, scroll: clamped }));
    // Paged: store as a multiple of the fit size; close to it means "fit".
    const factor = clamped === null ? null : (clamped * CSS_UNITS) / useReader.getState().fitScale;
    setZooms((z) => ({ ...z, paged: factor === null || Math.abs(factor - 1) < 0.03 ? null : factor }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => updateBook(book.id, { zoom: zooms.scroll ?? 0, pagedZoomFactor: zooms.paged ?? 0 }), 500);
    return () => clearTimeout(t);
  }, [book.id, zooms]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      if (useSplit.getState().active === 'notes') return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const reader = useReader.getState();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useHistory.getState().redo();
        else useHistory.getState().undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        useHistory.getState().redo();
      } else if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        changeZoom((z) => z * 1.2);
      } else if (mod && key === '-') {
        e.preventDefault();
        changeZoom((z) => z / 1.2);
      } else if (mod && key === '0') {
        e.preventDefault();
        changeZoom(null);
      } else if (mod && key === 'f') {
        e.preventDefault();
        useReader.setState({ sidebarTab: 'search' });
        useUi.getState().set({ sidebarOpen: true });
      } else if (!mod && !e.altKey && TOOL_KEYS[key]) {
        useUi.getState().set({ tool: TOOL_KEYS[key] });
      } else if (!mod && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault();
        reader.next();
      } else if (!mod && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault();
        reader.prev();
      } else if (e.key === 'Home') {
        reader.goToPage(1);
      } else if (e.key === 'End') {
        reader.goToPage(sizes.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeZoom, sizes.length]);

  useEffect(() => {
    const open = () => useUi.getState().set({ sidebarOpen: true });
    window.addEventListener('reader:open-sidebar', open);
    return () => window.removeEventListener('reader:open-sidebar', open);
  }, []);

  const View = viewMode === 'scroll' ? ScrollView : PagedView;

  return (
    <div className="flex h-full flex-col">
      <FullscreenChrome
        fullscreen={fullscreen.active}
        onExit={fullscreen.toggle}
        toolbar={
          <Toolbar
            book={book}
            pageCount={sizes.length}
            zoomPercent={Math.round((scale / CSS_UNITS) * 100)}
            fitWidth={zoom === null}
            onZoom={changeZoom}
            fullscreen={fullscreen}
          />
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <View key={viewMode === 'scroll' ? 'scroll' : 'paged'} doc={doc} sizes={sizes} zoom={zoom} onZoom={changeZoom} />
        {sidebarOpen && <Sidebar pageCount={sizes.length} />}
      </div>
      <SelectionMenu />
    </div>
  );
}
