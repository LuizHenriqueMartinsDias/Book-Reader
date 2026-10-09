import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Margins, Notebook, NotePage } from '../../../db/schema';
import { marginsOf, NO_MARGINS, pdfBox } from '../../../lib/notes/margins';
import { paperCss } from '../../../lib/notes/render';
import type { PDFDocumentProxy } from '../../../lib/pdf';
import PdfPageCanvas from '../../reader/PdfPageCanvas';
import { commitMargins } from './items';

type Side = keyof Margins;
/** Handles around the sheet: the sides each one moves and where it sits (fractions of the sheet). */
const HANDLES: { sides: Side[]; fx: number; fy: number; cursor: string }[] = [
  { sides: ['top', 'left'], fx: 0, fy: 0, cursor: 'nwse-resize' },
  { sides: ['top'], fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { sides: ['top', 'right'], fx: 1, fy: 0, cursor: 'nesw-resize' },
  { sides: ['right'], fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { sides: ['bottom', 'right'], fx: 1, fy: 1, cursor: 'nwse-resize' },
  { sides: ['bottom'], fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { sides: ['bottom', 'left'], fx: 0, fy: 1, cursor: 'nesw-resize' },
  { sides: ['left'], fx: 0, fy: 0.5, cursor: 'ew-resize' },
];

const PRESETS: { label: string; margins: (w: number, h: number) => Margins }[] = [
  { label: 'Sem margem', margins: () => NO_MARGINS },
  { label: 'Estreita', margins: () => ({ top: 36, right: 36, bottom: 36, left: 36 }) },
  { label: 'Larga', margins: (w) => ({ top: Math.round(w * 0.2), right: Math.round(w * 0.2), bottom: Math.round(w * 0.2), left: Math.round(w * 0.2) }) },
  { label: 'Notas à direita', margins: (w) => ({ top: 0, right: Math.round(w * 0.6), bottom: 0, left: 0 }) },
  { label: 'Notas embaixo', margins: (_, h) => ({ top: 0, right: 0, bottom: Math.round(h * 0.5), left: 0 }) },
];

/** Room around the sheet in the preview, px. */
const PAD = 22;
const AREA_HEIGHT = 300;
/** A side can grow up to this many times the PDF's size. */
const MAX_RATIO = 1.5;
/** Dragged closer than this to the PDF (px), a side snaps back to no margin. */
const SNAP_PX = 6;

const cm = (pt: number) => ((pt * 2.54) / 72).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const same = (a: Margins, b: Margins) => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

interface Props {
  notebook: Notebook;
  pages: NotePage[];
  page: NotePage;
  pdf: PDFDocumentProxy | null;
  onClose: () => void;
}

/** "Stretch the sheet": drag the edges of an imported PDF page to make room to write around it. */
export default function PageMarginsDialog({ notebook, pages, page, pdf, onClose }: Props) {
  const pdfPages = pages.filter((p) => p.background);
  const { w, h } = pdfBox(page);
  const [margins, setMargins] = useState(() => marginsOf(page));
  const marginsRef = useRef(margins);
  marginsRef.current = margins;
  // The preview is fitted to these and only refits when a drag ends, so the PDF holds still under the finger.
  const [fitted, setFitted] = useState(margins);
  const [dragging, setDragging] = useState(false);
  const [allPages, setAllPages] = useState(pdfPages.length > 1);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState(400);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fitW = w + fitted.left + fitted.right;
  const fitH = h + fitted.top + fitted.bottom;
  const k = Math.min((areaWidth - 2 * PAD) / fitW, (AREA_HEIGHT - 2 * PAD) / fitH);
  // The PDF's top-left corner in the preview.
  const px = (areaWidth - fitW * k) / 2 + fitted.left * k;
  const py = (AREA_HEIGHT - fitH * k) / 2 + fitted.top * k;
  const sheet = { left: px - margins.left * k, top: py - margins.top * k, width: (w + margins.left + margins.right) * k, height: (h + margins.top + margins.bottom) * k };

  const startDrag = (e: React.PointerEvent, sides: Side[]) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, margins };
    setDragging(true);
    const target = e.currentTarget as HTMLElement;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / k;
      const dy = (ev.clientY - start.y) / k;
      const next = { ...start.margins };
      const set = (side: Side, value: number, max: number) => {
        next[side] = value * k < SNAP_PX ? 0 : Math.round(Math.min(max, value));
      };
      if (sides.includes('left')) set('left', start.margins.left - dx, w * MAX_RATIO);
      if (sides.includes('right')) set('right', start.margins.right + dx, w * MAX_RATIO);
      if (sides.includes('top')) set('top', start.margins.top - dy, h * MAX_RATIO);
      if (sides.includes('bottom')) set('bottom', start.margins.bottom + dy, h * MAX_RATIO);
      marginsRef.current = next;
      setMargins(next);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setDragging(false);
      setFitted(marginsRef.current);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const choose = (m: Margins) => {
    setMargins(m);
    setFitted(m);
  };

  async function apply() {
    setSaving(true);
    try {
      await commitMargins(allPages ? pdfPages : [page], margins);
      onClose();
    } catch (e) {
      setSaving(false);
      alert(`Não foi possível esticar a folha: ${e instanceof Error ? e.message : e}`);
    }
  }

  const transition = dragging ? undefined : 'left 160ms, top 160ms, width 160ms, height 160ms';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--panel)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Esticar a folha</h2>
          <button type="button" className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <div ref={areaRef} className="relative overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-800" style={{ height: AREA_HEIGHT, touchAction: 'none' }}>
          <div className="absolute shadow-md" style={{ ...sheet, ...paperCss(notebook.paper, k), transition }} />
          <div className="absolute bg-white ring-1 ring-black/15" style={{ left: px, top: py, width: w * k, height: h * k, transition }}>
            {pdf && page.background && <PdfPageCanvas doc={pdf} pageNumber={page.background.pdfPage} scale={k} />}
          </div>
          <div className="pointer-events-none absolute border-2 border-sky-500" style={{ ...sheet, transition }} />
          {HANDLES.map(({ sides, fx, fy, cursor }) => (
            <div
              key={sides.join('-')}
              className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: sheet.left + fx * sheet.width, top: sheet.top + fy * sheet.height, cursor, transition }}
              onPointerDown={(e) => startDrag(e, sides)}
            >
              <span className="size-3.5 rounded-full border-2 border-sky-500 bg-white shadow" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Arraste as bordas para abrir espaço de anotação ao redor do PDF. Folha: {cm(w + margins.left + margins.right)} × {cm(h + margins.top + margins.bottom)} cm (PDF{' '}
          {cm(w)} × {cm(h)} cm).
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const m = p.margins(w, h);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => choose(m)}
                className={`rounded-lg border px-2.5 py-1 text-xs ${same(m, margins) ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {pdfPages.length > 1 && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} className="size-4 accent-amber-500" />
            Aplicar a todas as {pdfPages.length} páginas do PDF
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm hover:bg-[var(--app-bg)]" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50" onClick={apply}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
