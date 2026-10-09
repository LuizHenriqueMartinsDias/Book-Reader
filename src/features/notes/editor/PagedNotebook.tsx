import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addPage, deletePage, movePage } from '../../../db/notes';
import { db, type Notebook, type NotePage } from '../../../db/schema';
import { CSS_UNITS, type PDFDocumentProxy } from '../../../lib/pdf';
import { paperCss } from '../../../lib/notes/render';
import PdfPageCanvas from '../../reader/PdfPageCanvas';
import { useZoomGestures } from '../../reader/views/useZoomGestures';
import type { ZoomChange, ZoomMode } from '../../reader/views/types';
import { useNoteEditor } from './editorStore';
import NoteSurface from './NoteSurface';

const GAP = 12;
const FOOTER = 34;
const PADDING = 16;
const MAX_FIT = 2.2;

interface Props {
  notebook: Notebook;
  pages: NotePage[];
  pdf: PDFDocumentProxy | null;
  zoom: ZoomMode;
  onZoom: (z: ZoomChange) => void;
  onScale: (scale: number) => void;
}

/** A4-like pages one under the other, like a paper notebook; only pages near the screen render. */
export default function PagedNotebook({ notebook, pages, pdf, zoom, onZoom, onScale }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 800 });

  const maxWidth = useMemo(() => Math.max(...pages.map((p) => p.width), 1), [pages]);
  const fit = Math.min(MAX_FIT, Math.max(0.2, (viewport.width - 2 * PADDING) / maxWidth));
  const scale = zoom === null ? fit : zoom * CSS_UNITS;

  useEffect(() => onScale(scale), [scale, onScale]);

  const offsets = useMemo(() => {
    const out = [PADDING];
    for (const p of pages) out.push(out[out.length - 1] + p.height * scale + FOOTER + GAP);
    return out;
  }, [pages, scale]);

  const pageAt = useCallback(
    (y: number) => {
      let i = 0;
      while (i < pages.length - 1 && offsets[i + 1] <= y) i++;
      return i;
    },
    [offsets, pages.length],
  );

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
  const current = pages[pageAt(viewport.top + viewport.height / 2)];
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

  // Keep the reading position across zoom changes.
  const anchor = useRef<{ index: number; fraction: number } | null>(null);
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScale.current === scale) return;
    prevScale.current = scale;
    const a = anchor.current;
    if (a && pages[a.index]) el.scrollTop = offsets[a.index] + a.fraction * pages[a.index].height * scale - PADDING;
  }, [scale, offsets, pages]);

  const onScroll = () => {
    const el = scrollRef.current!;
    const i = pageAt(el.scrollTop + PADDING);
    if (pages[i]) anchor.current = { index: i, fraction: (el.scrollTop + PADDING - offsets[i]) / (pages[i].height * scale) };
    measure();
  };

  useZoomGestures(scrollRef, onZoom, () => scale / CSS_UNITS);

  const first = pageAt(viewport.top - viewport.height);
  const last = pageAt(viewport.top + viewport.height * 2);

  async function removePage(page: NotePage) {
    const count = await db.noteItems.where('pageId').equals(page.id).count();
    if (pages.length === 1) return alert('O caderno precisa ter pelo menos uma página.');
    if (count && !confirm('Apagar esta página e tudo o que está nela?')) return;
    deletePage(page);
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ touchAction: 'pan-x pan-y' }}>
      <div className="mx-auto" style={{ width: maxWidth * scale + 2 * PADDING, padding: PADDING }}>
        {pages.map((page, i) => {
          const w = page.width * scale;
          const h = page.height * scale;
          const active = i >= first && i <= last;
          return (
            <div key={page.id} style={{ marginBottom: GAP }}>
              <div className="relative mx-auto shadow-md" style={{ width: w, height: h, ...paperCss(notebook.paper, scale) }}>
                {active && (
                  <NoteSurface
                    notebook={notebook}
                    page={page}
                    width={w}
                    height={h}
                    view={{ x: 0, y: 0, zoom: scale }}
                    background={page.background && pdf ? <PdfPageCanvas doc={pdf} pageNumber={page.background.pdfPage} scale={scale} /> : undefined}
                  />
                )}
              </div>
              <div className="mx-auto flex items-center justify-between px-1 text-xs text-[var(--muted)]" style={{ width: w, height: FOOTER }}>
                <span>
                  Página {i + 1} de {pages.length}
                </span>
                <span className="flex items-center gap-0.5">
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
