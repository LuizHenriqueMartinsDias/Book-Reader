import { ListTree, Search, StickyNote, X } from 'lucide-react';
import { useUi } from '../../store/ui';
import EpubOutlinePanel from '../epub/EpubOutlinePanel';
import EpubSearchPanel from '../epub/EpubSearchPanel';
import NotesPanel from './NotesPanel';
import OutlinePanel from './OutlinePanel';
import { useReader, type SidebarTab } from './readerStore';
import SearchPanel from './SearchPanel';

const TABS: { id: SidebarTab; icon: typeof Search; label: string }[] = [
  { id: 'notes', icon: StickyNote, label: 'Notas' },
  { id: 'outline', icon: ListTree, label: 'Sumário' },
  { id: 'search', icon: Search, label: 'Buscar' },
];

export default function Sidebar({ pageCount }: { pageCount: number }) {
  const tab = useReader((s) => s.sidebarTab);
  const epub = useReader((s) => s.format === 'epub');
  const close = () => useUi.getState().set({ sidebarOpen: false });

  return (
    <>
      {/* On phones it's a sheet rising from the bottom over the page; tap outside or the handle to close. */}
      <div className="fixed inset-0 z-30 bg-black/35 md:hidden" onClick={close} />
      <aside className="fixed inset-x-0 bottom-0 z-40 flex h-[78dvh] flex-col rounded-t-2xl bg-[var(--panel)] shadow-[0_-8px_30px_rgba(0,0,0,0.2)] md:static md:z-auto md:h-auto md:w-80 md:rounded-none md:border-l md:border-[var(--border)] md:shadow-none">
        <button aria-label="Fechar painel" className="flex justify-center pt-2.5 pb-1 md:hidden" onClick={close}>
          <span className="h-1.5 w-10 rounded-full bg-[var(--border)]" />
        </button>
        <div className="flex items-center gap-1 border-b border-[var(--border)] p-1.5">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => useReader.setState({ sidebarTab: id })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm ${
                tab === id ? 'bg-[var(--app-bg)] font-medium' : 'text-[var(--muted)] hover:text-[var(--app-fg)]'
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
          <button aria-label="Fechar" className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--app-bg)] md:hidden" onClick={close}>
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'notes' && <NotesPanel />}
          {tab === 'outline' && (epub ? <EpubOutlinePanel /> : <OutlinePanel />)}
          {tab === 'search' && (epub ? <EpubSearchPanel /> : <SearchPanel pageCount={pageCount} />)}
        </div>
      </aside>
    </>
  );
}

/** Navigates to a page (PDF) or CFI (EPUB) and, on small screens, gets the sidebar out of the way. */
export function jumpTo(target: number | string) {
  const reader = useReader.getState();
  if (typeof target === 'string') reader.goToCfi(target);
  else reader.goToPage(target);
  if (window.matchMedia('(max-width: 767px)').matches) useUi.getState().set({ sidebarOpen: false });
}
