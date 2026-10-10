import { ArrowLeft, PanelRight, Type } from 'lucide-react';
import { useState } from 'react';
import type { Book } from '../../db/schema';
import { useUi, type EpubFont } from '../../store/ui';
import HeaderMenu, { fullscreenItem, useThemeItem } from '../reader/HeaderMenu';
import NotebookSideButton from '../reader/NotebookSideButton';
import { headerBtn as btn } from '../reader/Toolbar';
import ViewMenu from '../reader/ViewMenu';
import type { EpubLocation } from './EpubReader';
import { EPUB_FONTS, FONT_SIZES } from './epubTheme';

interface Props {
  book: Book;
  location: EpubLocation | null;
  fullscreen: { supported: boolean; toggle: () => void };
}

/**
 * The EPUB reader's header: the book and chapter, text appearance and reading options. Turning
 * pages, the position in the book and undo live in the dock at the bottom.
 */
export default function EpubToolbar({ book, location, fullscreen }: Props) {
  const ui = useUi();
  const [typeOpen, setTypeOpen] = useState(false);
  const sizeIndex = Math.max(0, FONT_SIZES.indexOf(ui.epubFontSize));
  const themeItem = useThemeItem();
  const chapter = location?.chapterTitle || (location ? `Capítulo ${location.chapter}` : '');

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-0.5 border-b border-[var(--border)] bg-[var(--panel)] px-1.5">
      <a href="#/" className={btn} title="Voltar à estante" aria-label="Voltar à estante">
        <ArrowLeft className="size-5" />
      </a>
      <span className="mx-1 flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-serif text-[15px] font-semibold" title={book.title}>
          {book.title}
        </span>
        {chapter && (
          <span className="truncate text-xs text-[var(--muted)]" title={chapter}>
            {chapter}
          </span>
        )}
      </span>
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
      <HeaderMenu className={btn} items={[...fullscreenItem(fullscreen), themeItem]} />
      <button
        className={`${btn} ${ui.sidebarOpen ? 'bg-amber-500/15 text-[var(--accent-text)]' : ''}`}
        title="Sumário, notas e busca"
        aria-label="Sumário, notas e busca"
        aria-pressed={ui.sidebarOpen}
        onClick={() => ui.set({ sidebarOpen: !ui.sidebarOpen })}
      >
        <PanelRight className="size-5" />
      </button>
      <div className="absolute inset-x-0 -bottom-px h-0.5">
        <div className="h-full bg-amber-500" style={{ width: `${(location?.percentage ?? 0) * 100}%` }} />
      </div>
    </header>
  );
}
