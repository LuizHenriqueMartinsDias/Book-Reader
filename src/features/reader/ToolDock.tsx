import { Eraser, Highlighter, MousePointer2, PenLine, PenTool, Redo2, StickyNote, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { STICKY_COLORS } from '../../lib/notes/sticky';
import { useHistory } from '../../store/history';
import { MARKER_COLORS, PEN_COLORS, useUi, type Tool } from '../../store/ui';
import InkSettings from '../InkSettings';

const TOOLS: { id: Tool; icon: typeof PenLine; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Selecionar texto (V)' },
  { id: 'pen', icon: PenLine, label: 'Caneta (P)' },
  { id: 'marker', icon: Highlighter, label: 'Marca-texto (H)' },
  { id: 'eraser', icon: Eraser, label: 'Borracha (E)' },
  { id: 'sticky', icon: StickyNote, label: 'Post-it (N): toque na página para colar um' },
];

export const dockBtn = 'flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--app-bg)] disabled:opacity-30 disabled:hover:bg-transparent';
const divider = <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" />;

/**
 * The reader's tools in a pill floating at the bottom, within thumb's reach and away from the
 * pages: they keep the whole stage above it.
 */
export function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 justify-center px-2 pt-1 pb-2">
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--panel)] p-1 shadow-lg [scrollbar-width:none]">
        {children}
      </div>
    </div>
  );
}

export function UndoRedo() {
  const { undoStack, redoStack, undo, redo } = useHistory();
  return (
    <>
      <button className={dockBtn} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!undoStack.length} onClick={undo}>
        <Undo2 className="size-5" />
      </button>
      <button className={dockBtn} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled={!redoStack.length} onClick={redo}>
        <Redo2 className="size-5" />
      </button>
    </>
  );
}

/** PDF pages: select, pen, marker, eraser and post-it, with the current tool's colors and thickness. */
export default function ToolDock() {
  const ui = useUi();
  // Under the select tool, the colors shown are those of the ink tool the stylus will use.
  const isPen = ui.tool === 'pen' || (ui.tool === 'select' && ui.lastInkTool === 'pen');
  const colors = isPen ? PEN_COLORS : MARKER_COLORS;
  const color = isPen ? ui.penColor : ui.markerColor;
  const inking = ui.tool === 'pen' || ui.tool === 'marker' || (ui.tool === 'select' && ui.penDetected && ui.stylusAlwaysInks);

  return (
    <Dock>
      {TOOLS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          title={label}
          aria-label={label}
          aria-pressed={ui.tool === id}
          onClick={() => ui.set({ tool: id })}
          className={`${dockBtn} ${ui.tool === id ? 'bg-stone-900 text-white hover:bg-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-100' : ''}`}
        >
          <Icon className="size-5" />
        </button>
      ))}

      {ui.penDetected && (
        <button
          title={
            ui.stylusAlwaysInks
              ? 'Caneta sempre escreve; o dedo navega e seleciona (toque para desligar)'
              : 'A caneta segue a ferramenta escolhida (toque para a caneta sempre escrever)'
          }
          aria-pressed={ui.stylusAlwaysInks}
          onClick={() => ui.set({ stylusAlwaysInks: !ui.stylusAlwaysInks })}
          className={`ml-1 flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap ${
            ui.stylusAlwaysInks ? 'border-amber-500 bg-amber-500/10 text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)]'
          }`}
        >
          <PenTool className="size-4" /> Caneta escreve
        </button>
      )}

      {ui.tool === 'sticky' && (
        <>
          {divider}
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              title="Cor do post-it"
              aria-label="Cor do post-it"
              aria-pressed={ui.stickyColor === c}
              onClick={() => ui.set({ stickyColor: c })}
              className="flex size-9 shrink-0 items-center justify-center"
            >
              <span
                className={`block size-6 rounded-sm shadow-sm ring-1 ring-black/10 ${ui.stickyColor === c ? 'outline-2 outline-offset-2 outline-[var(--app-fg)]' : ''}`}
                style={{ background: c }}
              />
            </button>
          ))}
        </>
      )}

      {inking && (
        <>
          {divider}
          {colors.map((c) => (
            <button
              key={c}
              title={c}
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => ui.set(isPen ? { penColor: c } : { markerColor: c })}
              className="flex size-9 shrink-0 items-center justify-center"
            >
              <span
                className={`block size-6 rounded-full ring-1 ring-black/10 ${color === c ? 'outline-2 outline-offset-2 outline-[var(--app-fg)]' : ''}`}
                style={{ background: c }}
              />
            </button>
          ))}
          <InkSettings tool={isPen ? 'pen' : 'marker'} />
        </>
      )}

      {divider}
      <UndoRedo />
    </Dock>
  );
}
