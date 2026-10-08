import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchEpub, type EpubHit } from '../../lib/epub';
import { useReader } from '../reader/readerStore';
import { jumpTo } from '../reader/Sidebar';

const MAX_HITS = 500;

/** Wraps the first occurrence of the query in the excerpt. */
function Excerpt({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-300/70 px-0.5 text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export default function EpubSearchPanel() {
  const epub = useReader((s) => s.epub);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<EpubHit[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const q = query.trim();
    const id = ++run.current;
    setHits([]);
    if (!epub || q.length < 2) return setProgress(null);
    const t = setTimeout(async () => {
      setProgress(0);
      const found = await searchEpub(
        epub,
        q,
        () => run.current !== id,
        (partial, fraction) => {
          if (run.current !== id) return;
          setHits(partial);
          setProgress(fraction);
        },
        MAX_HITS,
      ).catch(() => []);
      if (run.current === id) {
        setHits(found);
        setProgress(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, epub]);

  return (
    <div className="p-3">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar no livro…"
        className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-amber-500"
      />
      <div className="mt-2 flex h-5 items-center gap-2 text-xs text-[var(--muted)]">
        {progress !== null && <Loader2 className="size-3 animate-spin" />}
        {query.trim().length >= 2 &&
          `${hits.length}${hits.length >= MAX_HITS ? '+' : ''} resultado(s)${progress !== null ? ` · ${Math.round(progress * 100)}%` : ''}`}
      </div>
      <ul className="mt-1 space-y-1">
        {hits.map((h, i) => (
          <li key={i}>
            <button className="w-full rounded-md p-2 text-left text-sm hover:bg-[var(--app-bg)]" onClick={() => jumpTo(h.cfi)}>
              <div className="text-xs text-[var(--muted)]">{h.chapterTitle || `Seção ${h.chapter}`}</div>
              <div className="line-clamp-3">
                <Excerpt text={h.excerpt} query={query.trim()} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
