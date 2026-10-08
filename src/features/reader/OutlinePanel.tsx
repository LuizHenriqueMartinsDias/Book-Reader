import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadOutline, type OutlineItem } from '../../lib/pdf';
import { useReader } from './readerStore';
import { jumpTo } from './Sidebar';

export default function OutlinePanel() {
  const doc = useReader((s) => s.doc);
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);

  useEffect(() => {
    if (doc) loadOutline(doc).then(setOutline).catch(() => setOutline([]));
  }, [doc]);

  if (!outline) return <p className="p-4 text-sm text-[var(--muted)]">Carregando…</p>;
  if (!outline.length) return <p className="p-4 text-sm text-[var(--muted)]">Este PDF não tem sumário.</p>;
  return (
    <ul className="p-2 text-sm">
      {outline.map((item, i) => (
        <OutlineNode key={i} item={item} depth={0} />
      ))}
    </ul>
  );
}

function OutlineNode({ item, depth }: { item: OutlineItem; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && item.items.length < 12);
  return (
    <li>
      <div className="flex items-center rounded-md hover:bg-[var(--app-bg)]" style={{ paddingLeft: depth * 12 }}>
        <button
          className={`p-1 text-[var(--muted)] ${item.items.length ? '' : 'invisible'}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Recolher' : 'Expandir'}
        >
          <ChevronRight className={`size-3.5 transition ${open ? 'rotate-90' : ''}`} />
        </button>
        <button
          className="flex min-w-0 flex-1 items-baseline gap-2 py-1.5 pr-2 text-left"
          disabled={item.page === null}
          onClick={() => item.page && jumpTo(item.page)}
        >
          <span className="flex-1 truncate" title={item.title}>
            {item.title}
          </span>
          {item.page && <span className="text-xs text-[var(--muted)] tabular-nums">{item.page}</span>}
        </button>
      </div>
      {open && item.items.length > 0 && (
        <ul>
          {item.items.map((child, i) => (
            <OutlineNode key={i} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
