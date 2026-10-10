import { Brush as BrushIcon, Highlighter, Pen, PenLine, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Brush, Point } from '../db/schema';
import { drawStroke } from '../lib/ink';
import { useUi } from '../store/ui';
import { sizeCanvas } from './reader/canvasSize';

export const BRUSHES: { id: Brush; icon: typeof Pen; label: string; hint: string }[] = [
  { id: 'pen', icon: PenLine, label: 'Caneta', hint: 'Fica mais grossa com mais pressão' },
  { id: 'fineliner', icon: Pen, label: 'Caneta técnica', hint: 'Traço sempre da mesma espessura' },
  { id: 'brush', icon: BrushIcon, label: 'Pincel', hint: 'Varia muito com a pressão e afina nas pontas' },
  { id: 'pencil', icon: Pencil, label: 'Lápis', hint: 'Traço granulado, como grafite' },
];

/** Thickness range (points) and quick picks, per tool; the slider is logarithmic for fine control of thin lines. */
const RANGE = { pen: { min: 0.5, max: 24, quick: [0.5, 1, 2, 3, 5, 8, 12] }, marker: { min: 4, max: 48, quick: [6, 10, 14, 20, 28] } };
const STEPS = 1000;

const toSlider = (w: number, { min, max }: { min: number; max: number }) => Math.round((Math.log(w / min) / Math.log(max / min)) * STEPS);
const fromSlider = (t: number, { min, max }: { min: number; max: number }) => {
  const w = min * (max / min) ** (t / STEPS);
  return w < 10 ? Math.round(w * 10) / 10 : Math.round(w * 2) / 2;
};
export const formatWidth = (w: number) => w.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** A sample stroke, light at the ends and pressed in the middle, to preview a pen. */
const SAMPLE: Point[] = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  return [14 + t * 212, 34 + Math.sin(t * Math.PI * 2) * 12, 0.25 + 0.7 * Math.sin(t * Math.PI)];
});

/**
 * The pen settings button of a toolbar: kind of pen (for the pen) and thickness, with a
 * preview. `brushes: false` leaves out the kinds (shapes use the pen's thickness only); `opacity: false`
 * leaves out the opacity, for a toolbar that shows it on its own.
 */
export default function InkSettings({ tool, brushes = true, opacity: showOpacity = true }: { tool: 'pen' | 'marker'; brushes?: boolean; opacity?: boolean }) {
  const ui = useUi();
  const [open, setOpen] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const range = RANGE[tool];
  const width = tool === 'pen' ? ui.penWidth : ui.markerWidth;
  const color = tool === 'pen' ? ui.penColor : ui.markerColor;
  const brush = tool === 'pen' ? ui.penBrush : undefined;
  const opacity = tool === 'pen' ? ui.penOpacity : ui.markerOpacity;
  const setWidth = (w: number) => ui.set(tool === 'pen' ? { penWidth: w } : { markerWidth: w });
  const Icon = tool === 'marker' ? Highlighter : (BRUSHES.find((b) => b.id === ui.penBrush)?.icon ?? PenLine);

  useLayoutEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !open) return;
    const ratio = sizeCanvas(canvas, 240, 68);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, 240, 68);
    drawStroke(ctx, { tool, brush, color, width, opacity, points: SAMPLE });
  }, [open, tool, brush, color, width, opacity]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(null);
    const r = buttonRef.current!.getBoundingClientRect();
    // Fixed, so the scrolling toolbar doesn't cut it off; kept on screen, above the button when
    // it sits low (the reader's tools are at the bottom).
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 288));
    setOpen(r.top > window.innerHeight / 2 ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  };

  return (
    <>
      <button
        ref={buttonRef}
        title={tool === 'pen' ? 'Tipo de caneta e espessura' : 'Espessura do marca-texto'}
        onClick={toggle}
        className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs tabular-nums ${open ? 'bg-[var(--app-bg)]' : 'hover:bg-[var(--app-bg)]'}`}
      >
        {brushes || tool === 'marker' ? <Icon className="size-4" /> : null}
        <span className="flex size-4 items-center justify-center">
          <span className="rounded-full bg-current" style={{ width: Math.max(2, Math.min(16, width * (tool === 'pen' ? 1.4 : 0.5))), height: Math.max(2, Math.min(16, width * (tool === 'pen' ? 1.4 : 0.5))) }} />
        </span>
        {formatWidth(width)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
          <div className="fixed z-50 w-[280px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm shadow-xl" style={open}>
            {tool === 'pen' && brushes && (
              <>
                <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Tipo de caneta</div>
                <div className="mb-3 grid grid-cols-4 gap-1">
                  {BRUSHES.map((b) => (
                    <button
                      key={b.id}
                      title={b.hint}
                      onClick={() => ui.set({ penBrush: b.id })}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] leading-tight ${
                        ui.penBrush === b.id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'
                      }`}
                    >
                      <b.icon className="size-4" />
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--muted)]">
              <span>Espessura</span>
              <span className="tabular-nums">{formatWidth(width)} pt</span>
            </div>
            <input
              type="range"
              min={0}
              max={STEPS}
              value={toSlider(width, range)}
              onChange={(e) => setWidth(fromSlider(Number(e.target.value), range))}
              className="w-full accent-amber-500"
              aria-label="Espessura"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {range.quick.map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={`min-w-8 rounded-md border px-1.5 py-0.5 text-xs tabular-nums ${width === w ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
                >
                  {formatWidth(w)}
                </button>
              ))}
            </div>
            {showOpacity && (
              <div className="mt-3">
                <OpacitySlider tool={tool} />
              </div>
            )}
            <canvas ref={previewRef} className="mt-3 h-[68px] w-[240px] rounded-lg bg-white ring-1 ring-black/5" />
            {tool === 'pen' && (
              <label className="mt-3 flex items-start gap-2 text-xs">
                <input type="checkbox" checked={ui.lowLatencyInk} onChange={(e) => ui.set({ lowLatencyInk: e.target.checked })} className="mt-0.5 accent-amber-500" />
                <span>
                  Escrita rápida
                  <span className="block text-[var(--muted)]">O traço se estende até onde a caneta está indo, para acompanhá-la mais de perto. Se o fim do traço parecer tremer, desligue.</span>
                </span>
              </label>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** How see-through new strokes of the pen or marker are (10–100%), with quick picks. */
export function OpacitySlider({ tool }: { tool: 'pen' | 'marker' }) {
  const ui = useUi();
  const opacity = tool === 'pen' ? ui.penOpacity : ui.markerOpacity;
  const color = tool === 'pen' ? ui.penColor : ui.markerColor;
  const set = (o: number) => ui.set(tool === 'pen' ? { penOpacity: o } : { markerOpacity: o });
  const percent = Math.round(opacity * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--muted)]">
        <span>Opacidade</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => set(Number(e.target.value) / 100)}
        aria-label="Opacidade"
        aria-valuetext={`${percent}%`}
        className="w-full"
        style={{ accentColor: color }}
      />
      <div className="mt-1.5 flex gap-1">
        {[25, 50, 75, 100].map((p) => (
          <button
            key={p}
            onClick={() => set(p / 100)}
            className={`flex-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums ${percent === p ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}
