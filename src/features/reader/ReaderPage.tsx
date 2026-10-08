import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { updateBook } from '../../db/repo';
import { CSS_UNITS, type PageSize, type PDFDocumentProxy } from '../../lib/pdf';
import { useHistory } from '../../store/history';
import { useUi, type Tool } from '../../store/ui';
import type { Book } from '../../db/schema';
import PageView from './PageView';
import { useReader } from './readerStore';
import SelectionMenu from './SelectionMenu';
import Sidebar from './Sidebar';
import Toolbar from './Toolbar';
import { useDocument } from './useDocument';

export default function ReaderPage({ bookId }: { bookId: string }) {
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
  return <Reader book={state.book} doc={state.doc} sizes={state.sizes} />;
}

const GAP = 16;
const PADDING = 16;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const TOOL_KEYS: Record<string, Tool> = { v: 'select', p: 'pen', h: 'marker', e: 'eraser' };

/** `zoom` is relative to pdf.js' 100% (1pt = 96/72 px); `null` means fit to width. */
type ZoomMode = number | null;

function Reader({ book, doc, sizes }: { book: Book; doc: PDFDocumentProxy; sizes: PageSize[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 800 });
  const [zoom, setZoom] = useState<ZoomMode>(book.zoom > 0 ? book.zoom : null);
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const currentPage = useReader((s) => s.currentPage);

  const maxWidth = useMemo(() => Math.max(...sizes.map((s) => s.width)), [sizes]);
  const fitScale = Math.max(0.1, (viewport.width - 2 * PADDING) / maxWidth);
  const scale = zoom === null ? Math.min(fitScale, MAX_ZOOM * CSS_UNITS) : zoom * CSS_UNITS;

  const offsets = useMemo(() => {
    const out = [PADDING];
    for (const s of sizes) out.push(out[out.length - 1] + s.height * scale + GAP);
    return out;
  }, [sizes, scale]);

  const pageAt = useCallback(
    (y: number) => {
      let lo = 0;
      let hi = sizes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    },
    [offsets, sizes.length],
  );

  // Pages within one screen above/below render; everything else is a placeholder.
  const firstActive = pageAt(viewport.top - viewport.height);
  const lastActive = pageAt(viewport.top + viewport.height * 2);

  const goToPage = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const p = Math.min(Math.max(1, Math.round(page)), sizes.length);
      el.scrollTop = offsets[p - 1] - PADDING;
    },
    [offsets, sizes.length],
  );

  useEffect(() => {
    useReader.setState({ bookId: book.id, doc, currentPage: book.lastPage, focusNoteId: null });
    useHistory.getState().reset();
    updateBook(book.id, { lastOpenedAt: Date.now() });
    document.title = `${book.title} · Book Reader`;
    return () => {
      document.title = 'Book Reader';
      useReader.setState({ doc: null });
    };
  }, [book, doc]);

  useEffect(() => {
    useReader.setState({ goToPage });
  }, [goToPage]);

  // Restore the last-read page once the layout exists.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !scrollRef.current) return;
    restored.current = true;
    goToPage(book.lastPage);
  }, [goToPage, book.lastPage]);

  // Keep the same spot of the same page in view across zoom changes.
  const anchor = useRef<{ page: number; fraction: number } | null>(null);
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScale.current === scale) return;
    prevScale.current = scale;
    if (anchor.current) {
      const { page, fraction } = anchor.current;
      el.scrollTop = offsets[page - 1] + fraction * sizes[page - 1].height * scale - PADDING;
    }
  }, [scale, offsets, sizes]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
    const page = pageAt(el.scrollTop + el.clientHeight * 0.3);
    const top = el.scrollTop + PADDING;
    const p = pageAt(top);
    anchor.current = { page: p, fraction: (top - offsets[p - 1]) / (sizes[p - 1].height * scale) };
    if (page !== useReader.getState().currentPage) useReader.setState({ currentPage: page });
  }, [pageAt, offsets, sizes, scale]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const t = setTimeout(() => updateBook(book.id, { lastPage: currentPage }), 500);
    return () => clearTimeout(t);
  }, [book.id, currentPage]);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const changeZoom = useCallback((next: ZoomMode | ((current: number) => number)) => {
    const value = typeof next === 'function' ? next(scaleRef.current / CSS_UNITS) : next;
    setZoom(value === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100)));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => updateBook(book.id, { zoom: zoom ?? 0 }), 500);
    return () => clearTimeout(t);
  }, [book.id, zoom]);

  // Ctrl/⌘ + wheel (and trackpad pinch, which browsers report the same way).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      changeZoom((z) => z * Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [changeZoom]);

  // Two-finger pinch on touch screens.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let start: { dist: number; zoom: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { dist: dist(e.touches), zoom: scaleRef.current / CSS_UNITS };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const z = start.zoom * (dist(e.touches) / start.dist);
      changeZoom(z);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [changeZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const page = useReader.getState().currentPage;
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
        goToPage(page + 1);
      } else if (!mod && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault();
        goToPage(page - 1);
      } else if (e.key === 'Home') {
        goToPage(1);
      } else if (e.key === 'End') {
        goToPage(sizes.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeZoom, goToPage, sizes.length]);

  useEffect(() => {
    const open = () => useUi.getState().set({ sidebarOpen: true });
    window.addEventListener('reader:open-sidebar', open);
    return () => window.removeEventListener('reader:open-sidebar', open);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        book={book}
        pageCount={sizes.length}
        zoomPercent={Math.round((scale / CSS_UNITS) * 100)}
        fitWidth={zoom === null}
        onZoom={changeZoom}
      />
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={measure}
          className="min-w-0 flex-1 overflow-auto overscroll-contain"
          style={{ touchAction: 'pan-x pan-y' }}
        >
          <div style={{ height: offsets[sizes.length] + PADDING - GAP, minWidth: maxWidth * scale + 2 * PADDING }}>
            <div className="flex flex-col" style={{ gap: GAP, padding: PADDING }}>
              {sizes.map((size, i) => (
                <PageView
                  key={i}
                  doc={doc}
                  pageNumber={i + 1}
                  size={size}
                  scale={scale}
                  active={i + 1 >= firstActive && i + 1 <= lastActive}
                />
              ))}
            </div>
          </div>
        </div>
        {sidebarOpen && <Sidebar pageCount={sizes.length} />}
      </div>
      <SelectionMenu />
    </div>
  );
}
