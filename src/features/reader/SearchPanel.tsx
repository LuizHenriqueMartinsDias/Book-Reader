import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getPageText } from '../../lib/pdf';
import { useReader } from './readerStore';
import { jumpTo } from './Sidebar';

interface Hit {
  page: number;
  before: string;
  match: string;
  after: string;
}

const MAX_HITS = 500;
const CONTEXT = 40;

/** Case- and accent-insensitive, keeping string length so indices map back to the original. */
const fold = (s: string) =>
  [...s]
    .map((c) => {
      if (c.length > 1) return c;
      const base = c.normalize('NFD')[0].toLowerCase();
      return base.length === 1 ? base : c;
    })
    .join('');

export default function SearchPanel({ pageCount }: { pageCount: number }) {
  const doc = useReader((s) => s.doc);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const q = fold(query.trim());
    const id = ++run.current;
    setHits([]);
    if (!doc || q.length < 2) return setProgress(null);
    const t = setTimeout(async () => {
      const found: Hit[] = [];
      for (let p = 1; p <= pageCount && found.length < MAX_HITS; p++) {
        if (run.current !== id) return;
        const text = (await getPageText(doc, p)).replace(/\s+/g, ' ');
        const folded = fold(text);
        for (let i = folded.indexOf(q); i !== -1 && found.length < MAX_HITS; i = folded.indexOf(q, i + q.length)) {
          found.push({
            page: p,
            before: text.slice(Math.max(0, i - CONTEXT), i),
            match: text.slice(i, i + q.length),
            after: text.slice(i + q.length, i + q.length + CONTEXT),
          });
        }
        if (p % 10 === 0 || p === pageCount) {
          setProgress(p / pageCount);
          setHits([...found]);
        }
      }
      if (run.current === id) {
        setHits(found);
        setProgress(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, doc, pageCount]);

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
            <button className="w-full rounded-md p-2 text-left text-sm hover:bg-[var(--app-bg)]" onClick={() => jumpTo(h.page)}>
              <div className="text-xs text-[var(--muted)]">Página {h.page}</div>
              <div className="line-clamp-2">
                …{h.before}
                <mark className="rounded bg-amber-300/70 px-0.5 text-inherit">{h.match}</mark>
                {h.after}…
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
