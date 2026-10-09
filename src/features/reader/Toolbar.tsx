import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileDown,
  Highlighter,
  Loader2,
  Minus,
  Moon,
  MousePointer2,
  PanelRight,
  PenLine,
  PenTool,
  Plus,
  Redo2,
  StickyNote,
  Sun,
  SunDim,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, type Book } from '../../db/schema';
import { getBookFile } from '../../db/repo';
import { download } from '../../lib/backup';
import { useHistory } from '../../store/history';
import { MARKER_COLORS, PEN_COLORS, useUi, type Theme, type Tool } from '../../store/ui';
import InkSettings from '../InkSettings';
import { STICKY_COLORS } from '../../lib/notes/sticky';
import { useReader } from './readerStore';
import FullscreenButton from './FullscreenButton';
import NotebookSideButton from './NotebookSideButton';
import ViewMenu from './ViewMenu';

const TOOLS: { id: Tool; icon: typeof PenLine; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Selecionar texto (V)' },
  { id: 'pen', icon: PenLine, label: 'Caneta (P)' },
  { id: 'marker', icon: Highlighter, label: 'Marca-texto (H)' },
  { id: 'eraser', icon: Eraser, label: 'Borracha (E)' },
  { id: 'sticky', icon: StickyNote, label: 'Post-it (N): toque na página para colar um' },
];
const NEXT_THEME: Record<Theme, Theme> = { light: 'sepia', sepia: 'dark', dark: 'light' };
const THEME_ICON = { light: Sun, sepia: SunDim, dark: Moon };

const btn = 'rounded-md p-2 hover:bg-[var(--app-bg)] disabled:opacity-30 disabled:hover:bg-transparent';
const divider = <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" />;

interface Props {
  book: Book;
  pageCount: number;
  zoomPercent: number;
  fitWidth: boolean;
  onZoom: (next: number | null | ((z: number) => number)) => void;
  fullscreen: { supported: boolean; toggle: () => void };
}

export default function Toolbar({ book, pageCount, zoomPercent, fitWidth, onZoom, fullscreen }: Props) {
  const ui = useUi();
  const { undoStack, redoStack, undo, redo } = useHistory();
  const currentPage = useReader((s) => s.currentPage);
  const paged = ui.viewMode !== 'scroll';
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [exporting, setExporting] = useState(false);
  const ThemeIcon = THEME_ICON[ui.theme];

  useEffect(() => setPageInput(String(currentPage)), [currentPage]);

  // Under the select tool, the colors shown are those of the ink tool the stylus will use.
  const isPen = ui.tool === 'pen' || (ui.tool === 'select' && ui.lastInkTool === 'pen');
  const colors = isPen ? PEN_COLORS : MARKER_COLORS;
  const color = isPen ? ui.penColor : ui.markerColor;

  async function exportPdf() {
    setExporting(true);
    try {
      const [file, strokes, highlights, notes] = await Promise.all([
        getBookFile(book.id),
        db.strokes.where('bookId').equals(book.id).toArray(),
        db.highlights.where('bookId').equals(book.id).toArray(),
        db.notes.where('bookId').equals(book.id).toArray(),
      ]);
      if (!file) throw new Error('Arquivo não encontrado');
      const { exportAnnotatedPdf } = await import('../../lib/export');
      const bytes = await exportAnnotatedPdf(await file.arrayBuffer(), { strokes, highlights, notes });
      download(new Blob([bytes], { type: 'application/pdf' }), `${book.title} (anotado).pdf`);
    } catch (e) {
      alert(`Não foi possível exportar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 [scrollbar-width:none]">
      <a href="#/" className={btn} title="Voltar à estante">
        <ArrowLeft className="size-5" />
      </a>
      <span className="mr-2 hidden max-w-56 truncate text-sm font-medium lg:block" title={book.title}>
        {book.title}
      </span>

      <div className="flex shrink-0 rounded-lg bg-[var(--app-bg)] p-0.5">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => ui.set({ tool: id })}
            className={`rounded-md p-1.5 ${ui.tool === id ? 'bg-[var(--panel)] text-amber-600 shadow-sm' : 'opacity-70 hover:opacity-100'}`}
          >
            <Icon className="size-5" />
          </button>
        ))}
      </div>

      {ui.penDetected && (
        <button
          title={
            ui.stylusAlwaysInks
              ? 'Caneta sempre escreve; o dedo navega e seleciona (toque para desligar)'
              : 'A caneta segue a ferramenta escolhida (toque para a caneta sempre escrever)'
          }
          onClick={() => ui.set({ stylusAlwaysInks: !ui.stylusAlwaysInks })}
          className={`ml-1 flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${
            ui.stylusAlwaysInks ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-[var(--border)] text-[var(--muted)]'
          }`}
        >
          <PenTool className="size-4" /> Caneta escreve
        </button>
      )}

      {ui.tool === 'sticky' && (
        <div className="flex shrink-0 items-center gap-1 pl-1">
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              title="Cor do post-it"
              onClick={() => ui.set({ stickyColor: c })}
              className={`size-6 rounded-sm border-2 ${ui.stickyColor === c ? 'border-amber-500' : 'border-transparent'}`}
            >
              <span className="block size-full rounded-[2px] shadow-sm ring-1 ring-black/10" style={{ background: c }} />
            </button>
          ))}
        </div>
      )}

      {(ui.tool === 'pen' || ui.tool === 'marker' || (ui.tool === 'select' && ui.penDetected && ui.stylusAlwaysInks)) && (
        <div className="flex shrink-0 items-center gap-1 pl-1">
          {colors.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => ui.set(isPen ? { penColor: c } : { markerColor: c })}
              className={`size-6 rounded-full border-2 ${color === c ? 'border-amber-500' : 'border-transparent'}`}
            >
              <span className="block size-full rounded-full ring-1 ring-black/10" style={{ background: c }} />
            </button>
          ))}
          {divider}
          <InkSettings tool={isPen ? 'pen' : 'marker'} />
        </div>
      )}

      {divider}
      <button className={btn} title="Desfazer (Ctrl+Z)" disabled={!undoStack.length} onClick={undo}>
        <Undo2 className="size-5" />
      </button>
      <button className={btn} title="Refazer (Ctrl+Shift+Z)" disabled={!redoStack.length} onClick={redo}>
        <Redo2 className="size-5" />
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button className={`${btn} max-sm:hidden`} title="Diminuir zoom (Ctrl −)" onClick={() => onZoom((z) => z / 1.2)}>
          <Minus className="size-4" />
        </button>
        <button
          className={`w-14 rounded-md py-1 text-center text-sm tabular-nums hover:bg-[var(--app-bg)] ${fitWidth ? 'text-amber-600' : ''}`}
          title={fitWidth ? 'Ajustado à largura' : 'Ajustar à largura (Ctrl 0)'}
          onClick={() => onZoom(null)}
        >
          {zoomPercent}%
        </button>
        <button className={`${btn} max-sm:hidden`} title="Aumentar zoom (Ctrl +)" onClick={() => onZoom((z) => z * 1.2)}>
          <Plus className="size-4" />
        </button>
        {divider}
        {paged && (
          <button className={btn} title="Página anterior (←)" disabled={currentPage <= 1} onClick={() => useReader.getState().prev()}>
            <ChevronLeft className="size-5" />
          </button>
        )}
        <form
          className="flex items-center gap-1 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(pageInput, 10);
            if (n) useReader.getState().goToPage(n);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageInput(String(currentPage))}
            inputMode="numeric"
            aria-label="Página"
            className="w-12 rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 text-center tabular-nums"
          />
          <span className="text-[var(--muted)] tabular-nums">/ {pageCount}</span>
        </form>
        {paged && (
          <button className={btn} title="Próxima página (→)" onClick={() => useReader.getState().next()}>
            <ChevronRight className="size-5" />
          </button>
        )}
        {divider}
        <NotebookSideButton className={btn} />
        <ViewMenu className={btn} />
        <FullscreenButton className={btn} supported={fullscreen.supported} onClick={fullscreen.toggle} />
        <button className={btn} title="Tema" onClick={() => ui.set({ theme: NEXT_THEME[ui.theme] })}>
          <ThemeIcon className="size-5" />
        </button>
        <button className={btn} title="Exportar PDF com anotações" disabled={exporting} onClick={exportPdf}>
          {exporting ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />}
        </button>
        <button
          className={`${btn} ${ui.sidebarOpen ? 'text-amber-600' : ''}`}
          title="Sumário, notas e busca"
          onClick={() => ui.set({ sidebarOpen: !ui.sidebarOpen })}
        >
          <PanelRight className="size-5" />
        </button>
      </div>
    </header>
  );
}
