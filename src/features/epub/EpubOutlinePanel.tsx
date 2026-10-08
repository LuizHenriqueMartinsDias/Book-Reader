import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadToc, type TocItem } from '../../lib/epub';
import { useReader } from '../reader/readerStore';
import { jumpTo } from '../reader/Sidebar';

export default function EpubOutlinePanel() {
  const epub = useReader((s) => s.epub);
  const [toc, setToc] = useState<TocItem[] | null>(null);

  useEffect(() => {
    if (epub) loadToc(epub).then(setToc).catch(() => setToc([]));
  }, [epub]);

  if (!toc) return <p className="p-4 text-sm text-[var(--muted)]">Carregando…</p>;
  if (!toc.length) return <p className="p-4 text-sm text-[var(--muted)]">Este livro não tem sumário.</p>;
  return (
    <ul className="p-2 text-sm">
      {toc.map((item, i) => (
        <TocNode key={i} item={item} depth={0} />
      ))}
    </ul>
  );
}

function TocNode({ item, depth }: { item: TocItem; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && item.subitems.length < 12);
  return (
    <li>
      <div className="flex items-center rounded-md hover:bg-[var(--app-bg)]" style={{ paddingLeft: depth * 12 }}>
        <button
          className={`p-1 text-[var(--muted)] ${item.subitems.length ? '' : 'invisible'}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Recolher' : 'Expandir'}
        >
          <ChevronRight className={`size-3.5 transition ${open ? 'rotate-90' : ''}`} />
        </button>
        <button className="min-w-0 flex-1 truncate py-1.5 pr-2 text-left" title={item.label} onClick={() => jumpTo(item.href)}>
          {item.label}
        </button>
      </div>
      {open && item.subitems.length > 0 && (
        <ul>
          {item.subitems.map((child, i) => (
            <TocNode key={i} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
