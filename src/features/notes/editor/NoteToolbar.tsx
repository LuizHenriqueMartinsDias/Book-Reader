import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Circle,
  ClipboardPaste,
  Eraser,
  Expand,
  FileDown,
  Hand,
  Highlighter,
  ImagePlus,
  Lasso,
  Loader2,
  Minus,
  PenLine,
  Ruler,
  Plus,
  Redo2,
  RotateCcw,
  Shapes,
  Square,
  StickyNote,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { Notebook, PaperStyle, ShapeKind } from '../../../db/schema';
import { updateNotebook } from '../../../db/notes';
import { PAPER_COLORS } from '../../../lib/notes/render';
import { useNoteHistory } from '../../../store/history';
import { MARKER_COLORS, PEN_COLORS, useUi } from '../../../store/ui';
import FullscreenButton from '../../reader/FullscreenButton';
import { useNoteEditor, type EraserMode, type NoteTool } from './editorStore';

const TOOLS: { id: NoteTool; icon: typeof PenLine; label: string }[] = [
  { id: 'pen', icon: PenLine, label: 'Caneta (P)' },
  { id: 'marker', icon: Highlighter, label: 'Marca-texto (H)' },
  { id: 'eraser', icon: Eraser, label: 'Borracha (E)' },
  { id: 'lasso', icon: Lasso, label: 'Laço: selecionar e mover (L)' },
  { id: 'text', icon: Type, label: 'Texto (T)' },
  { id: 'shape', icon: Shapes, label: 'Formas (S)' },
];
const SHAPES: { id: ShapeKind; icon: typeof Minus; label: string }[] = [
  { id: 'line', icon: Minus, label: 'Linha' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Seta' },
  { id: 'rect', icon: Square, label: 'Retângulo' },
  { id: 'ellipse', icon: Circle, label: 'Elipse' },
];
const PAPERS: { id: PaperStyle; label: string }[] = [
  { id: 'blank', label: 'Liso' },
  { id: 'lined', label: 'Pautado' },
  { id: 'grid', label: 'Quadriculado' },
  { id: 'dotted', label: 'Pontilhado' },
];
const ERASER_MODES: { id: EraserMode; label: string; title: string }[] = [
  { id: 'partial', label: 'Normal', title: 'Apaga só o que a borracha passa por cima' },
  { id: 'stroke', label: 'Traço inteiro', title: 'Encostar num traço apaga ele inteiro' },
];
const ERASER_SIZES = [6, 10, 18];
const PEN_WIDTHS = [1, 2, 4];
const MARKER_WIDTHS = [8, 14, 22];
const TEXT_SIZES = [12, 16, 22, 30];

const btn = 'rounded-md p-2 hover:bg-[var(--app-bg)] disabled:opacity-30 disabled:hover:bg-transparent';
const divider = <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" />;

interface Props {
  notebook: Notebook;
  zoomPercent: number;
  onZoom: (z: number | null | ((z: number) => number)) => void;
  onInsertImage: (file: File) => void;
  onPaste: () => void;
  onExport: () => Promise<void>;
  onOpenBook: () => void;
  /** Paged notebooks: open "stretch the sheet" for the page in view. */
  onStretchPage?: () => void;
  rulerOn: boolean;
  onToggleRuler: () => void;
  fullscreen: { supported: boolean; toggle: () => void };
  /** Side by side with a book: close the notebook pane instead of going back. */
  onClose?: () => void;
}

export default function NoteToolbar({ notebook, zoomPercent, onZoom, onInsertImage, onPaste, onExport, onOpenBook, onStretchPage, rulerOn, onToggleRuler, fullscreen, onClose }: Props) {
  const ui = useUi();
  const editor = useNoteEditor();
  const { undoStack, redoStack, undo, redo } = useNoteHistory();
  const [paperOpen, setPaperOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  const rotated = Object.values(editor.pageRotation).some((r) => r !== 0) || editor.canvasRotation !== 0;
  const usesMarker = editor.tool === 'marker';
  const showsInk = ['pen', 'marker', 'shape', 'text'].includes(editor.tool);
  const colors = usesMarker ? MARKER_COLORS : PEN_COLORS;
  const color = usesMarker ? ui.markerColor : ui.penColor;
  const setColor = (c: string) => ui.set(usesMarker ? { markerColor: c } : { penColor: c });

  return (
    <header className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 [scrollbar-width:none]">
      {onClose ? (
        <button className={btn} title="Fechar caderno" onClick={onClose}>
          <X className="size-5" />
        </button>
      ) : (
        <a href="#/cadernos" className={btn} title="Voltar aos cadernos">
          <ArrowLeft className="size-5" />
        </a>
      )}
      <button
        className="mr-1 hidden max-w-48 truncate rounded-md px-1.5 py-1 text-sm font-medium hover:bg-[var(--app-bg)] lg:block"
        title="Renomear"
        onClick={() => {
          const title = prompt('Nome do caderno', notebook.title)?.trim();
          if (title) updateNotebook(notebook.id, { title });
        }}
      >
        {notebook.title}
      </button>

      <div className="flex shrink-0 rounded-lg bg-[var(--app-bg)] p-0.5">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => editor.set({ tool: id })}
            className={`rounded-md p-1.5 ${editor.tool === id ? 'bg-[var(--panel)] text-amber-600 shadow-sm' : 'opacity-70 hover:opacity-100'}`}
          >
            <Icon className="size-5" />
          </button>
        ))}
      </div>

      {editor.tool === 'shape' && (
        <div className="flex shrink-0 items-center gap-0.5 pl-1">
          {SHAPES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              title={label}
              onClick={() => editor.set({ shape: id })}
              className={`rounded-md p-1.5 ${editor.shape === id ? 'bg-[var(--app-bg)] text-amber-600' : ''}`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      )}

      {editor.tool === 'eraser' && (
        <div className="flex shrink-0 items-center gap-0.5 pl-1">
          {ERASER_MODES.map(({ id, label, title }) => (
            <button
              key={id}
              title={title}
              onClick={() => editor.set({ eraserMode: id })}
              className={`rounded-md px-2 py-1 text-xs whitespace-nowrap ${editor.eraserMode === id ? 'bg-[var(--app-bg)] font-medium text-amber-600' : 'opacity-70 hover:opacity-100'}`}
            >
              {label}
            </button>
          ))}
          {divider}
          {ERASER_SIZES.map((size, i) => (
            <button
              key={size}
              title={['Borracha pequena', 'Borracha média', 'Borracha grande'][i]}
              onClick={() => editor.set({ eraserSize: size })}
              className={`flex size-7 items-center justify-center rounded-md ${editor.eraserSize === size ? 'bg-[var(--app-bg)]' : ''}`}
            >
              <span className="rounded-full border-[1.5px] border-current" style={{ width: 6 + i * 4, height: 6 + i * 4 }} />
            </button>
          ))}
        </div>
      )}

      {showsInk && (
        <div className="flex shrink-0 items-center gap-1 pl-1">
          {colors.map((c) => (
            <button key={c} title={c} onClick={() => setColor(c)} className={`size-6 rounded-full border-2 ${color === c ? 'border-amber-500' : 'border-transparent'}`}>
              <span className="block size-full rounded-full ring-1 ring-black/10" style={{ background: c }} />
            </button>
          ))}
          {divider}
          {editor.tool === 'text'
            ? TEXT_SIZES.map((size) => (
                <button
                  key={size}
                  title={`Texto ${size}`}
                  onClick={() => editor.set({ textSize: size })}
                  className={`flex size-7 items-center justify-center rounded-md ${editor.textSize === size ? 'bg-[var(--app-bg)]' : ''}`}
                  style={{ fontSize: 9 + TEXT_SIZES.indexOf(size) * 3 }}
                >
                  A
                </button>
              ))
            : (usesMarker ? MARKER_WIDTHS : PEN_WIDTHS).map((w, i) => (
                <button
                  key={w}
                  title={['Fino', 'Médio', 'Grosso'][i]}
                  onClick={() => ui.set(usesMarker ? { markerWidth: w } : { penWidth: w })}
                  className={`flex size-7 items-center justify-center rounded-md ${(usesMarker ? ui.markerWidth : ui.penWidth) === w ? 'bg-[var(--app-bg)]' : ''}`}
                >
                  <span className="rounded-full bg-current" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                </button>
              ))}
        </div>
      )}

      {divider}
      <button className={`${btn} ${rulerOn ? 'bg-amber-500/15 text-amber-600' : ''}`} title={rulerOn ? 'Guardar régua (R)' : 'Régua (R)'} onClick={onToggleRuler}>
        <Ruler className="size-5" />
      </button>
      <button className={btn} title="Inserir imagem" onClick={() => imageInput.current?.click()}>
        <ImagePlus className="size-5" />
      </button>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onInsertImage(f);
          e.target.value = '';
        }}
      />
      {editor.clipboard && (
        <button className={btn} title="Colar (Ctrl+V)" onClick={onPaste}>
          <ClipboardPaste className="size-5" />
        </button>
      )}
      <button className={btn} title="Desfazer (Ctrl+Z)" disabled={!undoStack.length} onClick={undo}>
        <Undo2 className="size-5" />
      </button>
      <button className={btn} title="Refazer (Ctrl+Shift+Z)" disabled={!redoStack.length} onClick={redo}>
        <Redo2 className="size-5" />
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {rotated && (
          <button
            className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-500 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
            title="Desfazer o giro da folha"
            onClick={() => {
              editor.set({ pageRotation: {} });
              editor.straightenCanvas?.();
            }}
          >
            <RotateCcw className="size-4" /> Endireitar
          </button>
        )}
        <button
          className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${
            editor.fingerDraws ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-[var(--border)] text-[var(--muted)]'
          }`}
          title={
            editor.fingerDraws
              ? 'O dedo escreve com a ferramenta escolhida; dois dedos rolam e dão zoom. Toque para o dedo voltar a navegar.'
              : 'O dedo rola, dá zoom e gira a folha; a caneta escreve. Toque para escrever também com o dedo (sem caneta).'
          }
          onClick={() => editor.set({ fingerDraws: !editor.fingerDraws })}
        >
          {editor.fingerDraws ? <PenLine className="size-4" /> : <Hand className="size-4" />}
          {editor.fingerDraws ? 'Dedo: escreve' : 'Dedo: navega'}
        </button>
        <button className={`${btn} max-sm:hidden`} title="Diminuir zoom" onClick={() => onZoom((z) => z / 1.2)}>
          <Minus className="size-4" />
        </button>
        <button className="w-14 rounded-md py-1 text-center text-sm tabular-nums hover:bg-[var(--app-bg)]" title="Ajustar" onClick={() => onZoom(null)}>
          {zoomPercent}%
        </button>
        <button className={`${btn} max-sm:hidden`} title="Aumentar zoom" onClick={() => onZoom((z) => z * 1.2)}>
          <Plus className="size-4" />
        </button>
        {divider}
        <div className="relative">
          <button className={`${btn} ${paperOpen ? 'bg-[var(--app-bg)]' : ''}`} title="Papel" onClick={() => setPaperOpen((o) => !o)}>
            <StickyNote className="size-5" />
          </button>
          {paperOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPaperOpen(false)} />
              <div className="fixed top-12 right-2 z-50 w-60 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm shadow-xl">
                <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Papel</div>
                <div className="grid grid-cols-2 gap-1">
                  {PAPERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => updateNotebook(notebook.id, { paper: { ...notebook.paper, style: p.id } })}
                      className={`rounded-lg border py-1.5 text-xs ${notebook.paper.style === p.id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 mb-1.5 text-xs font-medium text-[var(--muted)]">Cor da página</div>
                <div className="flex gap-2">
                  {PAPER_COLORS.map((c) => (
                    <button
                      key={c}
                      title={c}
                      onClick={() => updateNotebook(notebook.id, { paper: { ...notebook.paper, color: c } })}
                      className={`size-8 rounded-md border-2 ${notebook.paper.color === c ? 'border-amber-500' : 'border-[var(--border)]'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                {onStretchPage && (
                  <button
                    className="mt-3 flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs hover:border-amber-500"
                    onClick={() => {
                      setPaperOpen(false);
                      onStretchPage();
                    }}
                  >
                    <Expand className="size-4" /> Esticar a folha…
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {!onClose && (
          <button className={btn} title="Abrir um livro ao lado" onClick={onOpenBook}>
            <BookOpen className="size-5" />
          </button>
        )}
        <button
          className={btn}
          title="Exportar como PDF"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            await onExport().finally(() => setExporting(false));
          }}
        >
          {exporting ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />}
        </button>
        <FullscreenButton className={btn} supported={fullscreen.supported} onClick={fullscreen.toggle} />
      </div>
    </header>
  );
}
