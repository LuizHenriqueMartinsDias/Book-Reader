import { BookOpen, Columns2, GalleryHorizontal, RectangleVertical, Rows3, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';
import { useUi, type SpreadLayout, type ViewMode } from '../../store/ui';

const MODES: { id: ViewMode; label: string; hint: string; icon: typeof BookOpen }[] = [
  { id: 'scroll', label: 'Rolagem', hint: 'Páginas em sequência vertical', icon: Rows3 },
  { id: 'flip', label: 'Livro', hint: 'A folha curva como papel', icon: BookOpen },
  { id: 'slide', label: 'Deslizar', hint: 'Páginas deslizam para o lado', icon: GalleryHorizontal },
  { id: 'instant', label: 'Sem animação', hint: 'Troca imediata de página', icon: Zap },
];

const LAYOUTS: { id: SpreadLayout; label: string; icon: typeof BookOpen }[] = [
  { id: 'auto', label: 'Automático', icon: Sparkles },
  { id: 'single', label: 'Uma', icon: RectangleVertical },
  { id: 'double', label: 'Duas', icon: Columns2 },
];

/** Toolbar popover choosing how pages advance and how many show at once. */
export default function ViewMenu({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const { viewMode, spreadLayout, set } = useUi();
  const Current = MODES.find((m) => m.id === viewMode)!.icon;

  return (
    <div className="relative">
      <button className={`${className} ${open ? 'bg-[var(--app-bg)]' : ''}`} title="Modo de leitura" onClick={() => setOpen((o) => !o)}>
        <Current className="size-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-2 top-12 z-50 w-64 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 text-sm shadow-xl">
            <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-[var(--muted)]">Passar página</div>
            {MODES.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                onClick={() => set({ viewMode: id })}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${viewMode === id ? 'bg-amber-500/15' : 'hover:bg-[var(--app-bg)]'}`}
              >
                <Icon className={`size-5 shrink-0 ${viewMode === id ? 'text-amber-600' : 'text-[var(--muted)]'}`} />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-[var(--muted)]">{hint}</span>
                </span>
              </button>
            ))}
            <div className="px-2 pt-3 pb-1.5 text-xs font-medium text-[var(--muted)]">Páginas na tela</div>
            <div className={`flex gap-1 ${viewMode === 'scroll' ? 'pointer-events-none opacity-40' : ''}`} title={viewMode === 'scroll' ? 'Disponível nos modos página a página' : undefined}>
              {LAYOUTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => set({ spreadLayout: id })}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-xs ${
                    spreadLayout === id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)] hover:bg-[var(--app-bg)]'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
