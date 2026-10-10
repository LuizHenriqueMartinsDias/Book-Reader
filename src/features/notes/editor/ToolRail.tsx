import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Highlighter,
  Lasso,
  Minus,
  PaintBucket,
  PenLine,
  Plus,
  Ruler,
  Shapes,
  Square,
  SquareRoundCorner,
  StickyNote,
  Type,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import type { NodeShape, ShapeKind } from '../../../db/schema';
import { STICKY_COLORS } from '../../../lib/notes/sticky';
import { MARKER_COLORS, PEN_COLORS, useUi } from '../../../store/ui';
import InkSettings from '../../InkSettings';
import { useNoteEditor, type EraserMode, type NoteTool } from './editorStore';

const TOOLS: { id: NoteTool; icon: typeof PenLine; label: string }[] = [
  { id: 'lasso', icon: Lasso, label: 'Laço: selecionar e mover (L)' },
  { id: 'pen', icon: PenLine, label: 'Caneta (P)' },
  { id: 'marker', icon: Highlighter, label: 'Marca-texto (H)' },
  { id: 'eraser', icon: Eraser, label: 'Borracha (E)' },
  { id: 'text', icon: Type, label: 'Texto (T)' },
  { id: 'shape', icon: Shapes, label: 'Formas (S)' },
  { id: 'diagram', icon: Workflow, label: 'Diagrama (D): toque para criar uma caixa, arraste para mover' },
  { id: 'sticky', icon: StickyNote, label: 'Post-it (N): toque para colar um na página' },
];
const NODE_SHAPES: { id: NodeShape; icon: typeof Square; label: string }[] = [
  { id: 'round', icon: SquareRoundCorner, label: 'Caixa arredondada' },
  { id: 'rect', icon: Square, label: 'Caixa' },
  { id: 'ellipse', icon: Circle, label: 'Elipse' },
  { id: 'diamond', icon: Diamond, label: 'Losango (decisão)' },
];
const SHAPES: { id: ShapeKind; icon: typeof Minus; label: string }[] = [
  { id: 'line', icon: Minus, label: 'Linha' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Seta' },
  { id: 'rect', icon: Square, label: 'Retângulo' },
  { id: 'ellipse', icon: Circle, label: 'Elipse' },
];
const ERASER_MODES: { id: EraserMode; label: string; title: string }[] = [
  { id: 'partial', label: 'Normal', title: 'Apaga só o que a borracha passa por cima' },
  { id: 'stroke', label: 'Traço inteiro', title: 'Encostar num traço apaga ele inteiro' },
];
const ERASER_SIZES = [6, 10, 18];
const TEXT_SIZES = [12, 16, 22, 30];
const TOOL_NAMES: Record<NoteTool, string> = {
  pen: 'Caneta',
  marker: 'Marca-texto',
  eraser: 'Borracha',
  lasso: 'Laço',
  text: 'Texto',
  shape: 'Formas',
  diagram: 'Diagrama',
  sticky: 'Post-it',
};

const railBtn = 'flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--app-bg)]';
const choice = (on: boolean) => `flex h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs ${on ? 'border-amber-500 bg-amber-500/10 font-medium' : 'border-[var(--border)] hover:bg-[var(--app-bg)]'}`;
const label = 'mb-1.5 text-xs font-medium text-[var(--muted)]';

/**
 * The notebook's drawing tools, floating over the page: a column on the left from tablets up, a
 * strip at the bottom on phones. Tapping the active tool (or the color dot) opens its options.
 */
export default function ToolRail({ rulerOn, onToggleRuler }: { rulerOn: boolean; onToggleRuler: () => void }) {
  const editor = useNoteEditor();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const color = editor.tool === 'marker' ? ui.markerColor : editor.tool === 'sticky' ? editor.stickyColor : ui.penColor;

  return (
    <>
      <div className="absolute z-20 flex gap-0.5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-xl max-md:bottom-3 max-md:left-1/2 max-md:max-w-[calc(100%-1.5rem)] max-md:-translate-x-1/2 max-md:overflow-x-auto max-md:[scrollbar-width:none] md:top-1/2 md:left-3 md:-translate-y-1/2 md:flex-col">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            title={label}
            aria-label={label}
            aria-pressed={editor.tool === id}
            onClick={() => (editor.tool === id ? setOpen((o) => !o) : (editor.set({ tool: id }), setOpen(false)))}
            className={`${railBtn} ${editor.tool === id ? 'bg-stone-900 text-white hover:bg-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-100' : ''}`}
          >
            <Icon className="size-5" />
          </button>
        ))}
        <button
          className={`${railBtn} ${rulerOn ? 'bg-amber-500/15 text-[var(--accent-text)]' : ''}`}
          title={rulerOn ? 'Guardar régua (R)' : 'Régua (R)'}
          aria-label="Régua"
          aria-pressed={rulerOn}
          onClick={onToggleRuler}
        >
          <Ruler className="size-5" />
        </button>
        <div className="mx-1.5 my-1 shrink-0 bg-[var(--border)] max-md:w-px md:h-px" />
        <button className={railBtn} title={`Opções: ${TOOL_NAMES[editor.tool]}`} aria-label={`Opções: ${TOOL_NAMES[editor.tool]}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="size-6 rounded-full ring-2 ring-[var(--panel)] outline-2 outline-[var(--border)]" style={{ background: color }} />
        </button>
      </div>

      {open && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={`Opções: ${TOOL_NAMES[editor.tool]}`}
            className="absolute z-30 w-72 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm shadow-2xl max-md:bottom-20 max-md:left-1/2 max-md:-translate-x-1/2 md:top-1/2 md:left-[4.75rem] md:-translate-y-1/2"
          >
            <div className="mb-3 font-semibold">{TOOL_NAMES[editor.tool]}</div>
            <ToolOptions />
          </div>
        </>
      )}
    </>
  );
}

/** What the current tool can be set to: shapes, eraser size, colors, thickness, text size. */
function ToolOptions() {
  const editor = useNoteEditor();
  const ui = useUi();
  const usesMarker = editor.tool === 'marker';
  const showsInk = ['pen', 'marker', 'shape', 'text', 'diagram'].includes(editor.tool);
  const colors = usesMarker ? MARKER_COLORS : PEN_COLORS;
  const color = usesMarker ? ui.markerColor : ui.penColor;
  const setColor = (c: string) => ui.set(usesMarker ? { markerColor: c } : { penColor: c });

  return (
    <div className="flex flex-col gap-4">
      {editor.tool === 'shape' && (
        <div>
          <div className={label}>Forma</div>
          <div className="grid grid-cols-4 gap-1.5">
            {SHAPES.map(({ id, icon: Icon, label }) => (
              <button key={id} title={label} aria-label={label} onClick={() => editor.set({ shape: id })} className={choice(editor.shape === id)}>
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      )}

      {editor.tool === 'diagram' && (
        <div>
          <div className={label}>Caixa</div>
          <div className="grid grid-cols-5 gap-1.5">
            {NODE_SHAPES.map(({ id, icon: Icon, label }) => (
              <button key={id} title={label} aria-label={label} onClick={() => editor.set({ nodeShape: id })} className={choice(editor.nodeShape === id)}>
                <Icon className="size-4" />
              </button>
            ))}
            <button
              title={editor.nodeFilled ? 'Caixas com fundo colorido' : 'Caixas sem fundo'}
              aria-label="Fundo colorido"
              aria-pressed={editor.nodeFilled}
              onClick={() => editor.set({ nodeFilled: !editor.nodeFilled })}
              className={choice(editor.nodeFilled)}
            >
              <PaintBucket className="size-4" />
            </button>
          </div>
        </div>
      )}

      {editor.tool === 'sticky' && (
        <div>
          <div className={label}>Cor do post-it</div>
          <div className="flex flex-wrap gap-2">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Cor ${c}`}
                aria-pressed={editor.stickyColor === c}
                onClick={() => editor.set({ stickyColor: c })}
                className={`size-9 rounded-md shadow-sm ring-1 ring-black/10 ${editor.stickyColor === c ? 'outline-2 outline-offset-2 outline-[var(--app-fg)]' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {editor.tool === 'eraser' && (
        <>
          <div>
            <div className={label}>Modo</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ERASER_MODES.map(({ id, label, title }) => (
                <button key={id} title={title} onClick={() => editor.set({ eraserMode: id })} className={choice(editor.eraserMode === id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={label}>Tamanho</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ERASER_SIZES.map((size, i) => (
                <button key={size} aria-label={['Pequena', 'Média', 'Grande'][i]} onClick={() => editor.set({ eraserSize: size })} className={choice(editor.eraserSize === size)}>
                  <span className="rounded-full border-[1.5px] border-current" style={{ width: 6 + i * 5, height: 6 + i * 5 }} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {editor.tool === 'lasso' && <p className="text-[var(--muted)]">Contorne o que quiser mover, redimensionar, recolorir, duplicar ou copiar.</p>}

      {showsInk && (
        <>
          <div>
            <div className={label}>Cor</div>
            <div className="flex flex-wrap gap-1">
              {colors.map((c) => (
                <button key={c} aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className="flex size-10 items-center justify-center">
                  <span className={`size-7 rounded-full ring-1 ring-black/10 ${color === c ? 'outline-2 outline-offset-2 outline-[var(--app-fg)]' : ''}`} style={{ background: c }} />
                </button>
              ))}
            </div>
          </div>
          {editor.tool === 'text' || editor.tool === 'diagram' ? (
            <div>
              <div className={label}>Tamanho do texto</div>
              <div className="grid grid-cols-4 gap-1.5">
                {TEXT_SIZES.map((size, i) => (
                  <button key={size} aria-label={`Texto ${size}`} onClick={() => editor.set({ textSize: size })} className={choice(editor.textSize === size)} style={{ fontSize: 10 + i * 3 }}>
                    A
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className={label.replace('mb-1.5 ', '')}>{editor.tool === 'pen' ? 'Tipo e espessura' : 'Espessura'}</span>
              <InkSettings tool={usesMarker ? 'marker' : 'pen'} brushes={editor.tool === 'pen'} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Zoom out, the zoom (tap to fit) and zoom in, floating in a corner of the notebook. */
export function ZoomControl({ zoomPercent, onZoom }: { zoomPercent: number; onZoom: (z: number | null | ((z: number) => number)) => void }) {
  return (
    <div className="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--panel)] p-1 shadow-lg max-md:hidden">
      <button className="flex size-9 items-center justify-center rounded-full hover:bg-[var(--app-bg)]" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => onZoom((z) => z / 1.2)}>
        <Minus className="size-4" />
      </button>
      <button className="h-9 w-14 rounded-full text-center text-sm tabular-nums hover:bg-[var(--app-bg)]" title="Ajustar à tela" onClick={() => onZoom(null)}>
        {zoomPercent}%
      </button>
      <button className="flex size-9 items-center justify-center rounded-full hover:bg-[var(--app-bg)]" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => onZoom((z) => z * 1.2)}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}
