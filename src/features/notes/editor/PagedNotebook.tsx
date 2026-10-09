import { ArrowDown, ArrowUp, Expand, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addPage, deletePage, movePage } from '../../../db/notes';
import { db, type Notebook, type NotePage } from '../../../db/schema';
import { snapQuarter, type Vec } from '../../../lib/notes/geometry';
import { hasMargins, marginsOf, pdfBox } from '../../../lib/notes/margins';
import { paperCss } from '../../../lib/notes/render';
import { appliedTurn, classify, initialTwoFinger, rotates, zooms, type TwoFingerState } from '../../../lib/notes/twoFinger';
import { CSS_UNITS, type PDFDocumentProxy } from '../../../lib/pdf';
import PdfPageCanvas from '../../reader/PdfPageCanvas';
import type { ZoomChange, ZoomMode } from '../../reader/views/types';
import { useNoteEditor } from './editorStore';
import NoteSurface from './NoteSurface';
import { anchorAt, buildLayout, FOOTER, GAP, PADDING, pageIndexAt, scrollFor, type Anchor, type PagedLayout } from './pagedLayout';

const MAX_FIT = 2.2;
/** Zoom limits relative to 100%, as in the editor. */
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;

interface Props {
  notebook: Notebook;
  pages: NotePage[];
  pdf: PDFDocumentProxy | null;
  zoom: ZoomMode;
  onZoom: (z: ZoomChange) => void;
  onScale: (scale: number) => void;
  /** Opens "stretch the sheet" for an imported PDF page. */
  onStretch: (page: NotePage) => void;
}

/** A4-like pages one under the other, like a paper notebook; only pages near the screen render. */
export default function PagedNotebook({ notebook, pages, pdf, zoom, onZoom, onScale, onStretch }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 800 });

  const maxWidth = useMemo(() => Math.max(...pages.map((p) => p.width), 1), [pages]);
  const fit = Math.min(MAX_FIT, Math.max(0.2, (viewport.width - 2 * PADDING) / maxWidth));
  const scale = zoom === null ? fit : zoom * CSS_UNITS;
  const layout = useMemo(() => buildLayout(pages, scale), [pages, scale]);
  const offsets = layout.offsets;

  useEffect(() => onScale(scale), [scale, onScale]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // The page around the middle of the screen receives pasted items, images and quotes.
  const current = pages[pageIndexAt(layout, viewport.top + viewport.height / 2)];
  useEffect(() => {
    if (!current) return;
    const top = offsets[pages.indexOf(current)];
    useNoteEditor.getState().set({
      currentPageId: current.id,
      insertTarget: () => {
        const el = scrollRef.current!;
        const mid = (el.scrollTop + el.clientHeight / 2 - top) / scale;
        return { pageId: current.id, x: current.width / 2, y: Math.min(Math.max(mid, 60), current.height - 60), viewWidth: current.width };
      },
    });
  }, [current, offsets, pages, scale]);

  // Zooming keeps a spot of the notebook in place: the one under the fingers or the cursor,
  // else the middle of the screen. It's measured in the layout before the change.
  const layoutRef = useRef(layout);
  const pendingAnchor = useRef<Anchor | null>(null);
  /** The spot under a point on screen (client coordinates), in the current layout. */
  const anchorAtClient = useCallback(([cx, cy]: Vec) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return anchorAt(layoutRef.current, el.scrollLeft, el.scrollTop, cx - r.left, cy - r.top);
  }, []);
  const zoomAround = useCallback(
    (next: ZoomChange, anchor: Anchor) => {
      pendingAnchor.current = anchor;
      onZoom(next);
    },
    [onZoom],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const before = layoutRef.current;
    layoutRef.current = layout;
    if (!el || before.scale === layout.scale) return;
    const a = pendingAnchor.current ?? anchorAt(before, el.scrollLeft, el.scrollTop, el.clientWidth / 2, el.clientHeight / 2);
    pendingAnchor.current = null;
    const { left, top } = scrollFor(layout, a);
    el.scrollLeft = left;
    el.scrollTop = top;
    measure();
  }, [layout, measure]);

  useTwoFingerGestures(scrollRef, contentRef, layoutRef, zoomAround);
  useCtrlWheelZoom(scrollRef, anchorAtClient, zoomAround);
  const pageRotation = useNoteEditor((s) => s.pageRotation);

  const first = pageIndexAt(layout, viewport.top - viewport.height);
  const last = pageIndexAt(layout, viewport.top + viewport.height * 2);

  async function removePage(page: NotePage) {
    const count = await db.noteItems.where('pageId').equals(page.id).count();
    if (pages.length === 1) return alert('O caderno precisa ter pelo menos uma página.');
    if (count && !confirm('Apagar esta página e tudo o que está nela?')) return;
    deletePage(page);
  }

  return (
    <div ref={scrollRef} onScroll={measure} className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ touchAction: 'pan-x pan-y' }}>
      <div ref={contentRef} className="mx-auto origin-top-left" style={{ width: maxWidth * scale + 2 * PADDING, padding: PADDING }}>
        {pages.map((page, i) => {
          const w = page.width * scale;
          const h = page.height * scale;
          const active = i >= first && i <= last;
          const rotation = pageRotation[page.id] ?? 0;
          return (
            <div key={page.id} style={{ marginBottom: GAP }}>
              <div
                data-page-box={page.id}
                className="relative mx-auto shadow-md"
                style={{ width: w, height: h, ...paperCss(notebook.paper, scale), transform: rotation ? `rotate(${rotation}deg)` : undefined }}
              >
                {active && (
                  <NoteSurface
                    notebook={notebook}
                    page={page}
                    width={w}
                    height={h}
                    view={{ x: 0, y: 0, zoom: scale }}
                    rotation={rotation}
                    background={page.background && pdf ? <PdfBackground page={page} pdf={pdf} pdfPage={page.background.pdfPage} scale={scale} /> : undefined}
                  />
                )}
              </div>
              <div className="mx-auto flex items-center justify-between px-1 text-xs text-[var(--muted)]" style={{ width: w, height: FOOTER }}>
                <span>
                  Página {i + 1} de {pages.length}
                </span>
                <span className="flex items-center gap-0.5">
                  {page.background && (
                    <button title="Esticar a folha (margens para anotar)" className="rounded p-1.5 hover:bg-[var(--panel)]" onClick={() => onStretch(page)}>
                      <Expand className="size-3.5" />
                    </button>
                  )}
                  <button title="Nova página depois desta" className="rounded p-1.5 hover:bg-[var(--panel)]" onClick={() => addPage(notebook.id, page.order)}>
                    <Plus className="size-3.5" />
                  </button>
                  <button title="Mover para cima" disabled={i === 0} className="rounded p-1.5 hover:bg-[var(--panel)] disabled:opacity-30" onClick={() => movePage(page, -1)}>
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    title="Mover para baixo"
                    disabled={i === pages.length - 1}
                    className="rounded p-1.5 hover:bg-[var(--panel)] disabled:opacity-30"
                    onClick={() => movePage(page, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button title="Apagar página" className="rounded p-1.5 hover:bg-[var(--panel)] hover:text-red-600" onClick={() => removePage(page)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => addPage(notebook.id)}
          className="mx-auto mb-8 flex items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-6 py-3 text-sm text-[var(--muted)] hover:border-amber-500 hover:text-amber-600"
        >
          <Plus className="size-4" /> Nova página
        </button>
      </div>
    </div>
  );
}

/** The imported PDF page, inset by the sheet's margins; outlined when there are any. */
function PdfBackground({ page, pdf, pdfPage, scale }: { page: NotePage; pdf: PDFDocumentProxy; pdfPage: number; scale: number }) {
  const box = pdfBox(page);
  return (
    <div
      className={`absolute ${hasMargins(marginsOf(page)) ? 'ring-1 ring-black/10' : ''}`}
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
    >
      <PdfPageCanvas doc={pdf} pageNumber={pdfPage} scale={scale} />
    </div>
  );
}

type TwoFinger = {
  /** Zoom and/or rotation (see twoFinger.ts). Scrolling by the midpoint happens throughout. */
  tf: TwoFingerState;
  dist: number;
  angle: number;
  mid: Vec;
  lastMid: Vec;
  scroll: Vec;
  /** Where the content's top-left corner was on screen when the fingers landed. */
  origin: Vec;
  scale: number;
  k: number;
  pageId: string | null;
  baseRotation: number;
};

/**
 * Two fingers zoom (previewed with a CSS transform so it stays smooth, then re-rendered sharp
 * around the fingers), rotate the page under them, or scroll (moving together); see
 * twoFinger.ts for how zoom and rotation are told apart.
 */
function useTwoFingerGestures(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>,
  layoutRef: { current: PagedLayout },
  zoomAround: (next: ZoomChange, anchor: Anchor) => void,
) {
  const zoomRef = useRef(zoomAround);
  zoomRef.current = zoomAround;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let g: TwoFinger | null = null;
    const info = (t: TouchList) => ({
      dist: Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY),
      angle: (Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180) / Math.PI,
      mid: [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2] as Vec,
    });

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const t = info(e.touches);
      const box = document.elementFromPoint(t.mid[0], t.mid[1])?.closest<HTMLElement>('[data-page-box]');
      const pageId = box?.dataset.pageBox ?? null;
      g = {
        tf: initialTwoFinger(),
        ...t,
        lastMid: t.mid,
        scroll: [el.scrollLeft, el.scrollTop],
        origin: [contentRef.current!.getBoundingClientRect().left, contentRef.current!.getBoundingClientRect().top],
        scale: layoutRef.current.scale,
        k: 1,
        pageId,
        baseRotation: pageId ? (useNoteEditor.getState().pageRotation[pageId] ?? 0) : 0,
      };
    };

    const onMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault(); // two fingers are ours, not the browser's
      const t = info(e.touches);
      const ratio = t.dist / g.dist;
      const turn = ((t.angle - g.angle + 540) % 360) - 180;
      // Real hands drift while they twist or pinch, so moving together never locks the gesture
      // into scrolling: it scrolls along while zoom and rotation can still start.
      const wasZooming = zooms(g.tf);
      g.tf = classify(g.tf, ratio, turn, !!g.pageId);
      g.lastMid = t.mid;
      if (zooms(g.tf) && !wasZooming) {
        // Zoom starts now: measure the preview from where scrolling has brought things.
        const cr = contentRef.current!.getBoundingClientRect();
        g.scroll = [el.scrollLeft, el.scrollTop];
        g.origin = [cr.left, cr.top];
        g.mid = t.mid;
      }

      if (!zooms(g.tf)) {
        el.scrollLeft = g.scroll[0] - (t.mid[0] - g.mid[0]);
        el.scrollTop = g.scroll[1] - (t.mid[1] - g.mid[1]);
      }
      if (zooms(g.tf)) {
        const target = Math.min(MAX_ZOOM * CSS_UNITS, Math.max(MIN_ZOOM * CSS_UNITS, g.scale * ratio));
        g.k = target / g.scale;
        const content = contentRef.current!;
        // Scale around the starting midpoint (in content coordinates) and follow the fingers.
        content.style.transformOrigin = `${g.mid[0] - g.origin[0]}px ${g.mid[1] - g.origin[1]}px`;
        content.style.transform = `translate(${t.mid[0] - g.mid[0]}px, ${t.mid[1] - g.mid[1]}px) scale(${g.k})`;
      }
      if (rotates(g.tf) && g.pageId) {
        const rotation = snapQuarter(g.baseRotation + appliedTurn(g.tf, turn));
        const editor = useNoteEditor.getState();
        editor.set({ pageRotation: { ...editor.pageRotation, [g.pageId]: rotation }, rotationHint: rotation });
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!g || e.touches.length >= 2) return;
      const done = g;
      g = null;
      if (rotates(done.tf)) useNoteEditor.getState().set({ rotationHint: null });
      if (!zooms(done.tf)) return;
      const content = contentRef.current!;
      const r = el.getBoundingClientRect();
      // The spot that was under the fingers at the start goes where the fingers ended.
      const start = anchorAt(layoutRef.current, done.scroll[0], done.scroll[1], done.mid[0] - r.left, done.mid[1] - r.top);
      content.style.transform = '';
      content.style.transformOrigin = '';
      zoomRef.current((done.scale * done.k) / CSS_UNITS, { ...start, sx: done.lastMid[0] - r.left, sy: done.lastMid[1] - r.top });
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
  }, [scrollRef, contentRef, layoutRef]);
}

/** Ctrl/⌘ + wheel (and trackpad pinch) zooms around the cursor. */
function useCtrlWheelZoom(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  anchorAtClient: (p: Vec) => Anchor,
  zoomAround: (next: ZoomChange, anchor: Anchor) => void,
) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAround((z) => z * Math.exp(-e.deltaY * 0.01), anchorAtClient([e.clientX, e.clientY]));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scrollRef, anchorAtClient, zoomAround]);
}
