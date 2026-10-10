import { ArrowLeft, ChevronLeft, ChevronRight, FileDown, Loader2, Minus, PanelRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, type Book } from '../../db/schema';
import { getBookFile } from '../../db/repo';
import { download } from '../../lib/backup';
import { useUi } from '../../store/ui';
import HeaderMenu, { fullscreenItem, useThemeItem } from './HeaderMenu';
import NotebookSideButton from './NotebookSideButton';
import { useReader } from './readerStore';
import ViewMenu from './ViewMenu';

export const headerBtn = 'flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--app-bg)] disabled:opacity-30 disabled:hover:bg-transparent';
const divider = <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)] max-sm:hidden" />;

interface Props {
  book: Book;
  pageCount: number;
  zoomPercent: number;
  fitWidth: boolean;
  onZoom: (next: number | null | ((z: number) => number)) => void;
  fullscreen: { supported: boolean; toggle: () => void };
}

/**
 * The PDF reader's header: the book, where you are in it, zoom and the reading options. The
 * drawing tools live in the dock at the bottom (ToolDock).
 */
export default function Toolbar({ book, pageCount, zoomPercent, fitWidth, onZoom, fullscreen }: Props) {
  const ui = useUi();
  const currentPage = useReader((s) => s.currentPage);
  const paged = ui.viewMode !== 'scroll';
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [exporting, setExporting] = useState(false);
  const themeItem = useThemeItem();

  useEffect(() => setPageInput(String(currentPage)), [currentPage]);

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
    <header className="relative flex h-12 shrink-0 items-center gap-0.5 border-b border-[var(--border)] bg-[var(--panel)] px-1.5">
      <a href="#/" className={headerBtn} title="Voltar à estante" aria-label="Voltar à estante">
        <ArrowLeft className="size-5" />
      </a>
      <span className="mx-1 min-w-0 flex-1 truncate font-serif text-[15px] font-semibold" title={book.title}>
        {book.title}
      </span>

      <div className="flex shrink-0 items-center max-md:hidden">
        <button className={headerBtn} title="Diminuir zoom (Ctrl −)" aria-label="Diminuir zoom" onClick={() => onZoom((z) => z / 1.2)}>
          <Minus className="size-4" />
        </button>
        <button
          className={`h-9 w-14 rounded-full text-center text-sm tabular-nums hover:bg-[var(--app-bg)] ${fitWidth ? 'text-[var(--accent-text)]' : ''}`}
          title={fitWidth ? 'Ajustado à tela' : 'Ajustar à tela (Ctrl 0)'}
          onClick={() => onZoom(null)}
        >
          {zoomPercent}%
        </button>
        <button className={headerBtn} title="Aumentar zoom (Ctrl +)" aria-label="Aumentar zoom" onClick={() => onZoom((z) => z * 1.2)}>
          <Plus className="size-4" />
        </button>
      </div>
      {divider}
      {paged && (
        <button className={`${headerBtn} max-sm:hidden`} title="Página anterior (←)" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => useReader.getState().prev()}>
          <ChevronLeft className="size-5" />
        </button>
      )}
      <form
        className="flex shrink-0 items-center gap-1 text-sm"
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
          className="h-8 w-11 rounded-full border border-[var(--border)] bg-transparent text-center tabular-nums"
        />
        <span className="text-[var(--muted)] tabular-nums">/ {pageCount}</span>
      </form>
      {paged && (
        <button className={`${headerBtn} max-sm:hidden`} title="Próxima página (→)" aria-label="Próxima página" onClick={() => useReader.getState().next()}>
          <ChevronRight className="size-5" />
        </button>
      )}
      {divider}
      <NotebookSideButton className={headerBtn} />
      <ViewMenu className={headerBtn} />
      <HeaderMenu
        className={headerBtn}
        items={[
          ...fullscreenItem(fullscreen),
          themeItem,
          { icon: exporting ? Loader2 : FileDown, label: 'Exportar PDF com anotações', onClick: exportPdf, disabled: exporting },
        ]}
      />
      <button
        className={`${headerBtn} ${ui.sidebarOpen ? 'bg-amber-500/15 text-[var(--accent-text)]' : ''}`}
        title="Sumário, notas e busca"
        aria-label="Sumário, notas e busca"
        aria-pressed={ui.sidebarOpen}
        onClick={() => ui.set({ sidebarOpen: !ui.sidebarOpen })}
      >
        <PanelRight className="size-5" />
      </button>
      {/* How far into the book, along the header's edge. */}
      <div className="absolute inset-x-0 -bottom-px h-0.5">
        <div className="h-full bg-amber-500" style={{ width: `${pageCount > 1 ? ((currentPage - 1) / (pageCount - 1)) * 100 : 0}%` }} />
      </div>
    </header>
  );
}
