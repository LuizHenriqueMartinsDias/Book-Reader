import { CalendarCheck, Compass, Library, NotebookPen } from 'lucide-react';
import type { ReactNode } from 'react';

export type HomeSection = 'books' | 'catalog' | 'notes' | 'routine';

const SECTIONS: { id: HomeSection; href: string; label: string; icon: typeof Library }[] = [
  { id: 'books', href: '#/', label: 'Estante', icon: Library },
  { id: 'catalog', href: '#/explorar', label: 'Explorar', icon: Compass },
  { id: 'notes', href: '#/cadernos', label: 'Cadernos', icon: NotebookPen },
  { id: 'routine', href: '#/rotina', label: 'Rotina', icon: CalendarCheck },
];

/**
 * The app's main screens (shelf, free books, notebooks, routine) with the way between them: a bar at the
 * bottom on phones, a side menu from tablets up, where `aside` (the screen's folders) goes too.
 */
export default function HomeLayout({ active, aside, children }: { active: HomeSection; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-full md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)] px-3 py-5 md:flex">
        <div className="px-3 pb-4 font-serif text-xl font-bold">Book Reader</div>
        <nav className="flex flex-col gap-1">
          {SECTIONS.map(({ id, href, label, icon: Icon }) => (
            <a
              key={id}
              href={href}
              aria-current={id === active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${
                id === active ? 'bg-amber-500/15 font-semibold' : 'text-[var(--muted)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]'
              }`}
            >
              <Icon className="size-5" /> {label}
            </a>
          ))}
        </nav>
        {aside}
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--panel)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {SECTIONS.map(({ id, href, label, icon: Icon }) => (
          <a
            key={id}
            href={href}
            aria-current={id === active ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs ${id === active ? 'font-semibold' : 'text-[var(--muted)]'}`}
          >
            <span className={`flex rounded-full px-5 py-1 ${id === active ? 'bg-amber-500/25' : ''}`}>
              <Icon className="size-5" />
            </span>
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
