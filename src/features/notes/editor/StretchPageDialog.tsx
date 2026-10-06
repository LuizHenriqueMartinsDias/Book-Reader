import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db, type Margins, type Notebook, type NotePage } from '../../../db/schema';
import { currentSides, MIN_PAGE, NO_MARGINS, snapToPaper, stretchBase } from '../../../lib/notes/margins';
import { drawItems, paperCss } from '../../../lib/notes/render';
import type { PDFDocumentProxy } from '../../../lib/pdf';
import { sizeCanvas } from '../../reader/canvasSize';
import PdfPageCanvas from '../../reader/PdfPageCanvas';
import { commitStretch } from './items';
import { useTemplateUrl } from './TemplateBackground';

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

const A4 = { w: 595, h: 842 };
type Preset = { label: string; sides: Margins };
const PDF_PRESETS = (w: number, h: number): Preset[] => [
  { label: 'Sem margem', sides: NO_MARGINS },
  { label: 'Estreita', sides: { top: 36, right: 36, bottom: 36, left: 36 } },
  { label: 'Larga', sides: { top: Math.round(w * 0.2), right: Math.round(w * 0.2), bottom: Math.round(w * 0.2), left: Math.round(w * 0.2) } },
  { label: 'Notas à direita', sides: { top: 0, right: Math.round(w * 0.6), bottom: 0, left: 0 } },
  { label: 'Notas embaixo', sides: { top: 0, right: 0, bottom: Math.round(h * 0.5), left: 0 } },
];
const PAGE_PRESETS = (w: number, h: number): Preset[] => [
  { label: 'Como está', sides: NO_MARGINS },
  { label: 'Mais larga', sides: { top: 0, right: Math.round(w * 0.5), bottom: 0, left: 0 } },
  { label: 'Mais comprida', sides: { top: 0, right: 0, bottom: Math.round(h * 0.5), left: 0 } },
  { label: w < h ? 'Deitada' : 'Em pé', sides: { top: 0, right: h - w, bottom: w - h, left: 0 } },
  ...(w === A4.w && h === A4.h ? [] : [{ label: 'Tamanho A4', sides: { top: 0, right: A4.w - w, bottom: A4.h - h, left: 0 } }]),
];

/** Room around the sheet in the preview, px. */
const PAD = 22;
const AREA_HEIGHT = 300;
/** A side can grow up to this many times the size it's measured from. */
const MAX_RATIO = 1.5;
/** Dragged closer than this (px) to where it started from, a side snaps back. */
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

/**
 * "Stretch the sheet": drag the page's edges to make room to write. On an imported PDF page it
 * adds margins around the PDF; on a plain page it makes the page bigger (or smaller).
 */
export default function StretchPageDialog({ notebook, pages, page, pdf, onClose }: Props) {
  // A page over a PDF page or a template opens margins around it; a plain page just resizes.
  const kindOf = (p: NotePage) => (p.background?.pdfPage ? 'pdf' : p.background?.template ? 'template' : 'plain');
  const kind = kindOf(page);
  const isPdf = kind !== 'plain';
  const group = pages.filter((p) => kindOf(p) === kind);
  const templateUrl = useTemplateUrl(page.background?.template);
  const base = stretchBase(page);
  const { w, h } = base;
  const [sides, setSides] = useState(() => currentSides(page));
  const sidesRef = useRef(sides);
  sidesRef.current = sides;
  // The preview is fitted to these and only refits when a drag ends, so the page holds still under the finger.
  const [fitted, setFitted] = useState(sides);
  const [allPages, setAllPages] = useState(isPdf && group.length > 1);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [areaWidth, setAreaWidth] = useState(400);
  const items = useLiveQuery(() => db.noteItems.where('pageId').equals(page.id).toArray(), [page.id]);

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

  // Fit both the sheet and what it's measured from (a shrinking page still shows its old outline).
  const out = (v: number) => Math.max(0, v);
  const fitW = w + out(fitted.left) + out(fitted.right);
  const fitH = h + out(fitted.top) + out(fitted.bottom);
  const k = Math.min((areaWidth - 2 * PAD) / fitW, (AREA_HEIGHT - 2 * PAD) / fitH);
  // Top-left corner of the base (the PDF, or the page as it is now) in the preview.
  const bx = (areaWidth - fitW * k) / 2 + out(fitted.left) * k;
  const by = (AREA_HEIGHT - fitH * k) / 2 + out(fitted.top) * k;
  const sheet = { left: bx - sides.left * k, top: by - sides.top * k, width: (w + sides.left + sides.right) * k, height: (h + sides.top + sides.bottom) * k };
  // Items are in page coordinates; where the page's origin is now, in the preview.
  const origin = [bx - base.x * k, by - base.y * k];

  // The page's writing, so you see where the new edges fall.
  useEffect(() => {
    const canvas = inkRef.current;
    if (!canvas || !items) return;
    const ratio = sizeCanvas(canvas, areaWidth, AREA_HEIGHT);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ratio * k, 0, 0, ratio * k, origin[0] * ratio, origin[1] * ratio);
    for (const t of items) {
      if (t.type !== 'text') continue;
      ctx.fillStyle = t.color;
      ctx.font = `${t.fontSize}px system-ui, sans-serif`;
      t.text.split('\n').forEach((line, i) => ctx.fillText(line, t.x + 4, t.y + t.fontSize * (1 + i * 1.35)));
    }
    drawItems(ctx, items);
  }, [items, areaWidth, k, origin[0], origin[1]]);

  const startDrag = (e: React.PointerEvent, moving: Side[]) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, sides };
    const target = e.currentTarget as HTMLElement;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / k;
      const dy = (ev.clientY - start.y) / k;
      const next = { ...start.sides };
      const set = (side: Side, value: number, opposite: Side, size: number) => {
        // A PDF's margins can't go below none; a plain page can shrink down to the minimum size.
        const min = isPdf ? 0 : MIN_PAGE - size - next[opposite];
        const v = Math.min(size * MAX_RATIO, Math.max(min, value));
        next[side] = Math.abs(v) * k < SNAP_PX ? 0 : Math.round(v);
      };
      if (moving.includes('left')) set('left', start.sides.left - dx, 'right', w);
      if (moving.includes('right')) set('right', start.sides.right + dx, 'left', w);
      if (moving.includes('top')) set('top', start.sides.top - dy, 'bottom', h);
      if (moving.includes('bottom')) set('bottom', start.sides.bottom + dy, 'top', h);
      const snapped = snapToPaper(next, notebook.paper);
      sidesRef.current = snapped;
      setSides(snapped);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setFitted(sidesRef.current);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const choose = (s: Margins) => {
    setSides(s);
    setFitted(s);
  };

  async function apply() {
    setSaving(true);
    try {
      await commitStretch(allPages ? group : [page], sides);
      onClose();
    } catch (e) {
      setSaving(false);
      alert(`Não foi possível esticar a folha: ${e instanceof Error ? e.message : e}`);
    }
  }

  const presets = (isPdf ? PDF_PRESETS : PAGE_PRESETS)(w, h).map((p) => ({ ...p, sides: snapToPaper(p.sides, notebook.paper) }));
  const newSize = `${cm(w + sides.left + sides.right)} × ${cm(h + sides.top + sides.bottom)} cm`;

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
          <div className="absolute shadow-md" style={{ ...sheet, ...paperCss(notebook.paper, k) }} />
          {isPdf ? (
            <div className="absolute bg-white ring-1 ring-black/15" style={{ left: bx, top: by, width: w * k, height: h * k }}>
              {pdf && page.background?.pdfPage && <PdfPageCanvas doc={pdf} pageNumber={page.background.pdfPage} scale={k} />}
              {templateUrl && <img src={templateUrl} alt="" className="size-full max-w-none" />}
            </div>
          ) : (
            <div className="pointer-events-none absolute border border-dashed border-stone-500/60" style={{ left: bx, top: by, width: w * k, height: h * k }} />
          )}
          <canvas ref={inkRef} className="pointer-events-none absolute inset-0 size-full" />
          <div className="pointer-events-none absolute border-2 border-sky-500" style={sheet} />
          {HANDLES.map(({ sides: moving, fx, fy, cursor }) => (
            <div
              key={moving.join('-')}
              className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: sheet.left + fx * sheet.width, top: sheet.top + fy * sheet.height, cursor }}
              onPointerDown={(e) => startDrag(e, moving)}
            >
              <span className="size-3.5 rounded-full border-2 border-sky-500 bg-white shadow" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {isPdf
            ? `Arraste as bordas para abrir espaço de anotação ao redor ${kind === 'pdf' ? 'do PDF' : 'do modelo'}. Folha: ${newSize} (${kind === 'pdf' ? 'PDF' : 'modelo'} ${cm(w)} × ${cm(h)} cm).`
            : `Arraste as bordas para aumentar ou diminuir a folha; o que está escrito fica no lugar. Folha: ${newSize} (agora ${cm(w)} × ${cm(h)} cm).`}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => choose(p.sides)}
              className={`rounded-lg border px-2.5 py-1 text-xs ${same(p.sides, sides) ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {group.length > 1 && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} className="size-4 accent-amber-500" />
            Aplicar a todas as {group.length} páginas {kind === 'pdf' ? 'do PDF' : kind === 'template' ? 'com modelo' : notebook.hasPdf ? 'sem PDF' : 'do caderno'}
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
