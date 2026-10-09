import { useLiveQuery } from 'dexie-react-hooks';
import type { Contents, Location, Rendition } from 'epubjs';
import { useEffect, useRef, useState } from 'react';
import { db, type Book } from '../../db/schema';
import { getBookFile, newId, updateBook } from '../../db/repo';
import { buildLocationIndex, flatToc, openEpub, progressAt, tocTitleAt, type EpubBook, type LocationIndex } from '../../lib/epub';
import { useHistory } from '../../store/history';
import { useUi } from '../../store/ui';
import AnnotationMenu, { type MenuTarget } from '../reader/AnnotationMenu';
import { useReader } from '../reader/readerStore';
import FullscreenChrome from '../reader/FullscreenChrome';
import Sidebar from '../reader/Sidebar';
import { useFullscreen } from '../reader/useFullscreen';
import { useSplit } from '../split/splitStore';
import EpubStickies from './EpubStickies';
import EpubToolbar from './EpubToolbar';
import { EPUB_FONTS, EPUB_THEMES, FONT_SIZES } from './epubTheme';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; book: Book; epub: EpubBook };

export default function EpubReader({ bookId, startCfi }: { bookId: string; startCfi?: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let epub: EpubBook | null = null;
    (async () => {
      const [book, file] = await Promise.all([db.books.get(bookId), getBookFile(bookId)]);
      if (!book || !file) throw new Error('Livro não encontrado na biblioteca.');
      epub = openEpub(await file.arrayBuffer());
      await epub.ready;
      if (!cancelled) setState({ status: 'ready', book, epub });
    })().catch((e) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
      epub?.destroy();
    };
  }, [bookId]);

  if (state.status === 'loading') return <div className="p-8 text-[var(--muted)]">Abrindo livro…</div>;
  if (state.status === 'error')
    return (
      <div className="p-8">
        <p className="mb-4">Não foi possível abrir este EPUB: {state.message}</p>
        <a href="#/" className="text-amber-600 underline">
          Voltar à estante
        </a>
      </div>
    );
  return <EpubView book={state.book} epub={state.epub} startCfi={startCfi} />;
}

export interface EpubLocation {
  cfi: string;
  chapter: number;
  chapterTitle: string;
  /** Fraction of the whole book and position (~1000 characters each), once locations are computed. */
  percentage: number | null;
  position: number | null;
  atStart: boolean;
  atEnd: boolean;
}

type Menu = { x: number; y: number; target: MenuTarget; clear?: () => void };

function EpubView({ book, epub, startCfi }: { book: Book; epub: EpubBook; startCfi?: string }) {
  // Seed the per-book store before children render.
  useState(() => {
    useReader.setState({ bookId: book.id, format: 'epub', doc: null, epub, currentPage: 1, currentCfi: startCfi ?? book.lastLocation ?? null, focusNoteId: null });
    useHistory.getState().reset();
  });

  const viewerRef = useRef<HTMLDivElement>(null);
  const [rendition, setRendition] = useState<Rendition | null>(null);
  const [location, setLocation] = useState<EpubLocation | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const locIndex = useRef<LocationIndex | null>(null);
  const lastRelocation = useRef<Location | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const { viewMode, spreadLayout, theme, epubFontSize, epubFont, sidebarOpen } = useUi();
  const flow = viewMode === 'scroll' ? 'scrolled' : 'paginated';
  const spread = spreadLayout === 'single' ? 'none' : spreadLayout === 'double' ? 'always' : 'auto';
  const fullscreen = useFullscreen();
  const highlights = useLiveQuery(() => db.highlights.where('bookId').equals(book.id).toArray(), [book.id]);

  useEffect(() => {
    useReader.setState({ epub });
    updateBook(book.id, { lastOpenedAt: Date.now() });
    document.title = `${book.title} · Book Reader`;
    return () => {
      document.title = 'Book Reader';
      useReader.setState({ epub: null });
    };
  }, [book, epub]);

  const onRelocated = useRef((loc: Location) => {
    lastRelocation.current = loc;
    const { cfi, index, href, displayed } = loc.start;
    const progress = locIndex.current ? progressAt(locIndex.current, index, displayed.page, displayed.total) : null;
    setLocation({
      cfi,
      chapter: index + 1,
      chapterTitle: tocTitleAt(flatToc(epub), href, renditionRef.current?.getRange(cfi)?.startContainer),
      percentage: progress?.fraction ?? null,
      position: progress?.position ?? null,
      atStart: loc.atStart,
      atEnd: loc.atEnd,
    });
    useReader.setState({ currentCfi: cfi, currentPage: progress?.position ?? 0 });
  });

  // Percentages need "locations" (a CFI every ~1000 characters); computing them takes a
  // while on long books, so they're cached on the book record.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (book.locations) epub.locations.load(book.locations);
      else {
        await epub.locations.generate(1000);
        if (cancelled) return;
        updateBook(book.id, { locations: epub.locations.save() });
      }
      if (cancelled) return;
      locIndex.current = buildLocationIndex(JSON.parse(epub.locations.save()) as string[], spineLength(epub));
      if (lastRelocation.current) onRelocated.current(lastRelocation.current);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [book, epub]);

  // The rendition is rebuilt when switching between scrolling and pages. It's created on the
  // next tick so React's development double-mount doesn't build (and half-destroy) a second one.
  useEffect(() => {
    let r: Rendition | null = null;
    let displayed: Promise<unknown> = Promise.resolve();
    const timer = setTimeout(() => ({ r, displayed } = createRendition()));
    return () => {
      clearTimeout(timer);
      if (!r) return;
      const old = r;
      setRendition(null);
      // Destroying while the first section is still loading makes epub.js throw; wait for it.
      displayed.finally(() => {
        try {
          old.destroy();
        } catch {
          // already torn down
        }
      });
    };
  }, [epub, flow]);

  function createRendition() {
    const el = viewerRef.current!;
    const r = epub.renderTo(el, {
      width: '100%',
      height: '100%',
      flow,
      manager: flow === 'scrolled' ? 'continuous' : 'default',
      spread: useUi.getState().spreadLayout === 'single' ? 'none' : useUi.getState().spreadLayout === 'double' ? 'always' : 'auto',
      allowScriptedContent: false,
    });
    const paged = flow === 'paginated';

    r.on('relocated', (loc: Location) => onRelocated.current(loc));

    // epub.js reports selections while the mouse is still held; show the menu on release.
    let mouseDown = false;
    let pending: (() => void) | null = null;
    r.on('mousedown', () => {
      mouseDown = true;
    });
    r.on('mouseup', () => {
      mouseDown = false;
      pending?.();
      pending = null;
    });
    r.on('selected', (cfiRange: string, contents: Contents) => {
      const show = () => showSelection(cfiRange, contents);
      if (mouseDown) pending = show;
      else show();
    });
    const showSelection = (cfiRange: string, contents: Contents) => {
      const range = r.getRange(cfiRange);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      const frame = (contents.window.frameElement as HTMLElement).getBoundingClientRect();
      const text = range.toString().replace(/\s+/g, ' ').trim();
      if (!text) return;
      const position = useReader.getState().currentPage;
      setMenu({
        x: frame.left + rect.left + rect.width / 2,
        y: frame.top + rect.bottom,
        clear: () => contents.window.getSelection()?.removeAllRanges(),
        target: {
          kind: 'selection',
          text,
          createHighlights: (color) => [{ id: newId(), bookId: book.id, page: position, color, rects: [], cfi: cfiRange, text, createdAt: Date.now() }],
        },
      });
    };

    // Gestures inside the book's iframe: swipe and edge taps turn pages.
    let touch: { x: number; y: number } | null = null;
    r.on('touchstart', (e: TouchEvent) => {
      touch = { x: e.changedTouches[0].screenX, y: e.changedTouches[0].screenY };
    });
    r.on('touchend', (e: TouchEvent) => {
      if (!touch || !paged) return;
      const dx = e.changedTouches[0].screenX - touch.x;
      const dy = e.changedTouches[0].screenY - touch.y;
      touch = null;
      const selecting = !(e.view?.getSelection()?.isCollapsed ?? true);
      if (selecting || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) r.next();
      else r.prev();
    });
    r.on('click', (e: MouseEvent) => {
      if (!(e.view?.getSelection()?.isCollapsed ?? true)) return;
      setMenu(null);
      if (!paged || (e.target as Element | null)?.closest?.('a')) return;
      const frame = (e.view?.frameElement as HTMLElement | null)?.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (!frame) return;
      const x = (frame.left + e.clientX - box.left) / box.width;
      if (x < 0.2) r.prev();
      else if (x > 0.8) r.next();
    });
    r.on('keydown', (e: KeyboardEvent) => handleKey(e));

    const displayed = r.display(useReader.getState().currentCfi ?? undefined).catch(() => r.display());
    useReader.setState({
      next: () => r.next(),
      prev: () => r.prev(),
      goToCfi: (target) => {
        r.display(target);
      },
      goToPage: (chapter) => {
        const section = epub.spine.get(chapter - 1);
        if (section) r.display(section.href);
      },
    });
    renditionRef.current = r;
    setRendition(r);
    return { r, displayed };
  }

  // Text appearance, applied live.
  useEffect(() => {
    if (!rendition) return;
    const colors = EPUB_THEMES[theme];
    const family = EPUB_FONTS[epubFont].family;
    rendition.themes.register('app', {
      body: { background: `${colors.background} !important`, color: `${colors.color} !important` },
      'body *': { color: 'inherit !important', 'background-color': 'transparent !important', ...(family ? { 'font-family': `${family} !important` } : {}) },
      'body a, body a *': { color: `${colors.link} !important` },
      img: { 'max-width': '100% !important' },
    });
    rendition.themes.select('app');
    rendition.themes.fontSize(`${epubFontSize}%`);
  }, [rendition, theme, epubFont, epubFontSize]);

  useEffect(() => {
    rendition?.spread(spread);
  }, [rendition, spread]);

  // Keep the rendition's highlights in sync with the database (so undo/redo just works).
  const applied = useRef(new Map<string, { cfi: string; color: string }>());
  useEffect(() => {
    if (!rendition) return;
    const shown = applied.current;
    const wanted = new Map((highlights ?? []).filter((h) => h.cfi).map((h) => [h.id, h]));
    for (const [id, { cfi }] of shown) {
      const h = wanted.get(id);
      if (!h || h.color !== shown.get(id)!.color) {
        rendition.annotations.remove(cfi, 'highlight');
        shown.delete(id);
      }
    }
    for (const h of wanted.values()) {
      if (shown.has(h.id)) continue;
      rendition.annotations.highlight(
        h.cfi!,
        { id: h.id },
        (e: MouseEvent) => setMenu({ x: e.clientX, y: e.clientY + 8, target: { kind: 'highlight', highlight: h } }),
        'epub-highlight',
        { fill: h.color, 'fill-opacity': '0.4', 'mix-blend-mode': theme === 'dark' ? 'screen' : 'multiply' },
      );
      shown.set(h.id, { cfi: h.cfi!, color: h.color });
    }
  }, [rendition, highlights, theme]);

  // A new rendition starts without marks; re-theming changes the blend mode.
  useEffect(() => {
    applied.current = new Map();
  }, [rendition, theme]);

  // Save the reading position shortly after it settles.
  useEffect(() => {
    if (!location) return;
    const t = setTimeout(
      () => updateBook(book.id, { lastLocation: location.cfi, ...(location.percentage !== null ? { progress: location.percentage } : {}) }),
      600,
    );
    return () => clearTimeout(t);
  }, [book.id, location]);

  const handleKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (useSplit.getState().active === 'notes') return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const reader = useReader.getState();
    const ui = useUi.getState();
    const step = (dir: 1 | -1) => {
      const i = FONT_SIZES.indexOf(ui.epubFontSize);
      const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir))];
      ui.set({ epubFontSize: next });
    };
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) useHistory.getState().redo();
      else useHistory.getState().undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      useHistory.getState().redo();
    } else if (mod && (key === '=' || key === '+')) {
      e.preventDefault();
      step(1);
    } else if (mod && key === '-') {
      e.preventDefault();
      step(-1);
    } else if (mod && key === 'f') {
      e.preventDefault();
      useReader.setState({ sidebarTab: 'search' });
      ui.set({ sidebarOpen: true });
    } else if (!mod && (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && useUi.getState().viewMode !== 'scroll'))) {
      e.preventDefault();
      reader.next();
    } else if (!mod && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
      e.preventDefault();
      reader.prev();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // Follow the container's size (sidebar opening, rotation).
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || !rendition) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Only once epub.js has laid out its view (and not after it's torn down).
        if ((rendition as unknown as { manager?: { stage?: unknown } }).manager?.stage) rendition.resize(el.clientWidth, el.clientHeight);
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [rendition]);

  // Close the menu on any press outside it (presses inside the book close it via the rendition).
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-selection-menu]')) return;
      menu.clear?.();
      setMenu(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menu]);

  useEffect(() => {
    const open = () => useUi.getState().set({ sidebarOpen: true });
    window.addEventListener('reader:open-sidebar', open);
    return () => window.removeEventListener('reader:open-sidebar', open);
  }, []);

  const colors = EPUB_THEMES[theme];

  return (
    <div className="flex h-full flex-col">
      <FullscreenChrome
        fullscreen={fullscreen.active}
        onExit={fullscreen.toggle}
        toolbar={<EpubToolbar book={book} location={location} fullscreen={fullscreen} />}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col" style={{ background: colors.background }}>
          <div className={`min-h-0 flex-1 ${flow === 'paginated' ? 'px-4 py-6 sm:px-10' : ''}`}>
            <div ref={viewerRef} data-reader-pages className="mx-auto size-full max-w-[1400px]" />
          </div>
          {rendition && <EpubStickies rendition={rendition} bookId={book.id} />}
          {flow === 'paginated' && <ProgressBar epub={epub} location={location} rendition={rendition} />}
        </div>
        {sidebarOpen && <Sidebar pageCount={0} />}
      </div>
      {menu && (
        <AnnotationMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          onClose={() => {
            menu.clear?.();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

const spineLength = (epub: EpubBook) => (epub.spine as unknown as { length: number }).length;

/** Scrubber for paged mode: shows how far along you are and jumps anywhere in the book. */
function ProgressBar({ epub, location, rendition }: { epub: EpubBook; location: EpubLocation | null; rendition: Rendition | null }) {
  const [drag, setDrag] = useState<number | null>(null);
  const ready = location?.percentage != null;
  const value = drag ?? location?.percentage ?? 0;
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--muted)]">
      <span className="hidden max-w-60 truncate sm:block" title={location?.chapterTitle}>
        {location?.chapterTitle || (location ? `Capítulo ${location.chapter}` : '')}
      </span>
      <input
        type="range"
        min={0}
        max={1000}
        disabled={!ready}
        value={Math.round(value * 1000)}
        onChange={(e) => setDrag(Number(e.target.value) / 1000)}
        onPointerUp={() => {
          if (drag !== null && rendition) rendition.display(epub.locations.cfiFromPercentage(drag));
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null && rendition) rendition.display(epub.locations.cfiFromPercentage(drag));
          setDrag(null);
        }}
        className="min-w-0 flex-1 accent-amber-500"
        aria-label="Posição no livro"
      />
      <span className="w-20 text-right tabular-nums">{ready ? `${Math.round(value * 100)}%` : 'calculando…'}</span>
    </div>
  );
}
