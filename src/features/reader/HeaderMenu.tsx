import { Maximize, Moon, MoreHorizontal, Sun, SunDim } from 'lucide-react';
import { useState } from 'react';
import { useUi, type Theme } from '../../store/ui';

const NEXT_THEME: Record<Theme, Theme> = { light: 'sepia', sepia: 'dark', dark: 'light' };
const THEME_ICON = { light: Sun, sepia: SunDim, dark: Moon };
const THEME_NAME = { light: 'claro', sepia: 'sépia', dark: 'escuro' };

export interface MenuItem {
  icon: typeof Sun;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** The reader's theme (light → sepia → dark), as a header button or a menu item. */
export function useThemeItem(): MenuItem {
  const theme = useUi((s) => s.theme);
  return { icon: THEME_ICON[theme], label: `Tema: ${THEME_NAME[theme]}`, onClick: () => useUi.getState().set({ theme: NEXT_THEME[theme] }) };
}

export const fullscreenItem = (fullscreen: { supported: boolean; toggle: () => void }): MenuItem[] =>
  fullscreen.supported ? [{ icon: Maximize, label: 'Tela cheia', onClick: fullscreen.toggle }] : [];

/**
 * Header items that show as buttons from tablets up and gather in a "⋯" menu on phones,
 * where the header has no room for them.
 */
export default function HeaderMenu({ items, className }: { items: MenuItem[]; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {items.map(({ icon: Icon, label, onClick, disabled }) => (
        <button key={label} className={`${className} max-sm:hidden`} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
          <Icon className="size-5" />
        </button>
      ))}
      <div className="relative sm:hidden">
        <button className={className} aria-label="Mais opções" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <MoreHorizontal className="size-5" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-11 right-0 z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 text-sm shadow-xl">
              {items.map(({ icon: Icon, label, onClick, disabled }) => (
                <button
                  key={label}
                  disabled={disabled}
                  onClick={() => {
                    setOpen(false);
                    onClick();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-[var(--app-bg)] disabled:opacity-40"
                >
                  <Icon className="size-5 text-[var(--muted)]" /> {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
