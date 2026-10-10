import { ArrowLeft, BookOpen, ClipboardPaste, Expand, FileDown, FileText, Hand, ImagePlus, Loader2, PenLine, Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Notebook, PaperStyle } from '../../../db/schema';
import { updateNotebook } from '../../../db/notes';
import { PAPER_COLORS } from '../../../lib/notes/render';
import { useNoteHistory } from '../../../store/history';
import FullscreenButton from '../../reader/FullscreenButton';
import { useNoteEditor } from './editorStore';
import TemplatePicker from './TemplatePicker';

const PAPERS: { id: PaperStyle; label: string }[] = [
  { id: 'blank', label: 'Liso' },
  { id: 'lined', label: 'Pautado' },
  { id: 'grid', label: 'Quadriculado' },
  { id: 'dotted', label: 'Pontilhado' },
];
const btn = 'flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--app-bg)] disabled:opacity-30 disabled:hover:bg-transparent';
const divider = <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" />;

interface Props {
  notebook: Notebook;
  onInsertImage: (file: File) => void;
  onPaste: () => void;
  onExport: () => Promise<void>;
  onOpenBook: () => void;
  /** Paged notebooks: open "stretch the sheet" for the page in view. */
  onStretchPage?: () => void;
  /** Paged notebooks: page templates for the page in view. */
  template?: React.ComponentProps<typeof TemplatePicker>;
  fullscreen: { supported: boolean; toggle: () => void };
  /** Side by side with a book: close the notebook pane instead of going back. */
  onClose?: () => void;
}

/**
 * The notebook's top bar: back, title, undo, paper and pages, images, export. The drawing tools
 * float over the page (ToolRail), and so does the zoom.
 */
export default function NoteToolbar({ notebook, onInsertImage, onPaste, onExport, onOpenBook, onStretchPage, template, fullscreen, onClose }: Props) {
  const editor = useNoteEditor();
  const { undoStack, redoStack, undo, redo } = useNoteHistory();
  const [paperOpen, setPaperOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  const rotated = Object.values(editor.pageRotation).some((r) => r !== 0) || editor.canvasRotation !== 0;

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-1.5 [scrollbar-width:none]">
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
        className="mr-1 max-w-56 min-w-0 truncate rounded-md px-1.5 py-1 font-serif text-[15px] font-semibold hover:bg-[var(--app-bg)] max-sm:hidden"
        title="Renomear"
        onClick={() => {
          const title = prompt('Nome do caderno', notebook.title)?.trim();
          if (title) updateNotebook(notebook.id, { title });
        }}
      >
        {notebook.title}
      </button>

      <div className="mx-1 flex-1" />
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

      <div className="flex shrink-0 items-center gap-1">
        {rotated && (
          <button
            className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-500 bg-amber-500/10 px-2 py-1 text-xs font-medium text-[var(--accent-text)]"
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
            editor.fingerDraws ? 'border-amber-500 bg-amber-500/10 text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)]'
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
        {divider}
        <div className="relative">
          <button className={`${btn} ${paperOpen ? 'bg-[var(--app-bg)]' : ''}`} title="Papel" onClick={() => setPaperOpen((o) => !o)}>
            <FileText className="size-5" />
          </button>
          {paperOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPaperOpen(false)} />
              <div className="fixed top-12 right-2 z-50 max-h-[calc(100dvh-4rem)] w-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm shadow-xl">
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
                {template && (
                  <div className="mt-3">
                    <TemplatePicker {...template} />
                  </div>
                )}
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
