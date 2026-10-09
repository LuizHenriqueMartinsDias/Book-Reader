import { ArrowLeft, ChevronLeft, ChevronRight, Moon, PanelRight, Redo2, Sun, SunDim, Type, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Book } from '../../db/schema';
import { useHistory } from '../../store/history';
import { useUi, type EpubFont, type Theme } from '../../store/ui';
import { useReader } from '../reader/readerStore';
import FullscreenButton from '../reader/FullscreenButton';
import NotebookSideButton from '../reader/NotebookSideButton';
import ViewMenu from '../reader/ViewMenu';
import type { EpubLocation } from './EpubReader';
import { EPUB_FONTS, FONT_SIZES } from './epubTheme';

const NEXT_THEME: Record<Theme, Theme> = { light: 'sepia', sepia: 'dark', dark: 'light' };
const THEME_ICON = { light: Sun, sepia: SunDim, dark: Moon };
const btn = 'rounded-md p-2 hover:bg-[var(--app-bg)] disabled:opacity-30 disabled:hover:bg-transparent';
const divider = <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" />;

interface Props {
  book: Book;
  location: EpubLocation | null;
  fullscreen: { supported: boolean; toggle: () => void };
}

export default function EpubToolbar({ book, location, fullscreen }: Props) {
  const ui = useUi();
  const { undoStack, redoStack, undo, redo } = useHistory();
  const [typeOpen, setTypeOpen] = useState(false);
  const ThemeIcon = THEME_ICON[ui.theme];
  const sizeIndex = Math.max(0, FONT_SIZES.indexOf(ui.epubFontSize));

  return (
    <header className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 [scrollbar-width:none]">
      <a href="#/" className={btn} title="Voltar à estante">
        <ArrowLeft className="size-5" />
      </a>
      <span className="mr-2 hidden max-w-64 truncate text-sm font-medium lg:block" title={book.title}>
        {book.title}
      </span>
      <button className={btn} title="Desfazer (Ctrl+Z)" disabled={!undoStack.length} onClick={undo}>
        <Undo2 className="size-5" />
      </button>
      <button className={btn} title="Refazer (Ctrl+Shift+Z)" disabled={!redoStack.length} onClick={redo}>
        <Redo2 className="size-5" />
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button className={btn} title="Anterior (←)" disabled={location?.atStart} onClick={() => useReader.getState().prev()}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-12 text-center text-sm text-[var(--muted)] tabular-nums">
          {location?.percentage != null ? `${Math.round(location.percentage * 100)}%` : ''}
        </span>
        <button className={btn} title="Próxima (→)" disabled={location?.atEnd} onClick={() => useReader.getState().next()}>
          <ChevronRight className="size-5" />
        </button>
        {divider}
        <div className="relative">
          <button className={`${btn} ${typeOpen ? 'bg-[var(--app-bg)]' : ''}`} title="Texto" onClick={() => setTypeOpen((o) => !o)}>
            <Type className="size-5" />
          </button>
          {typeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setTypeOpen(false)} />
              <div className="fixed top-12 right-2 z-50 w-60 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm shadow-xl">
                <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Tamanho do texto</div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-xs disabled:opacity-30"
                    disabled={sizeIndex === 0}
                    onClick={() => ui.set({ epubFontSize: FONT_SIZES[sizeIndex - 1] })}
                  >
                    A−
                  </button>
                  <span className="flex-1 text-center tabular-nums">{ui.epubFontSize}%</span>
                  <button
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-base disabled:opacity-30"
                    disabled={sizeIndex === FONT_SIZES.length - 1}
                    onClick={() => ui.set({ epubFontSize: FONT_SIZES[sizeIndex + 1] })}
                  >
                    A+
                  </button>
                </div>
                <div className="mt-3 mb-1.5 text-xs font-medium text-[var(--muted)]">Fonte</div>
                <div className="flex gap-1">
                  {(Object.keys(EPUB_FONTS) as EpubFont[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => ui.set({ epubFont: f })}
                      style={{ fontFamily: EPUB_FONTS[f].family ?? undefined }}
                      className={`flex-1 rounded-lg border py-1.5 text-xs ${ui.epubFont === f ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
                    >
                      {EPUB_FONTS[f].label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <NotebookSideButton className={btn} />
        <ViewMenu className={btn} />
        <FullscreenButton className={btn} supported={fullscreen.supported} onClick={fullscreen.toggle} />
        <button className={btn} title="Tema" onClick={() => ui.set({ theme: NEXT_THEME[ui.theme] })}>
          <ThemeIcon className="size-5" />
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
