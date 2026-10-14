import { ExternalLink, Loader2, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SEARCH_PANEL } from '../../lib/menuSpot';
import { lookUp, lookupWord, type DictEntry, type DictResult } from '../../lib/lookup/dictionary';

const WIDTH = 320;
/** Senses shown per part of speech; the rest are on the Wiktionary. */
const SENSES = 4;
/** Entries read as the reader's own: Portuguese, and symbols (listed as "Multilíngue"). */
const HOME = ['Português', 'Multilíngue'];

interface Props {
  x: number;
  y: number;
  text: string;
  onClose: () => void;
}

type Dict = { state: 'loading' } | { state: 'done'; result: DictResult | null } | { state: 'error' };

/**
 * "Significado" of the selection menu: the word's meanings from the Wiktionary, and a web search
 * for what it doesn't have (or to read more).
 */
export default function LookupCard({ x, y, text, onClose }: Props) {
  const word = lookupWord(text);
  const [dict, setDict] = useState<Dict>({ state: 'loading' });

  useEffect(() => {
    const abort = new AbortController();
    lookUp(word, abort.signal).then(
      (result) => setDict({ state: 'done', result }),
      () => !abort.signal.aborted && setDict({ state: 'error' }),
    );
    return () => abort.abort();
  }, [word]);

  const left = Math.min(Math.max(8, x - WIDTH / 2), window.innerWidth - WIDTH - 8);
  // Below the selection when there's room, else as low as it fits above the browser's search panel.
  const top = Math.max(8, Math.min(y + 8, window.innerHeight - SEARCH_PANEL - 300));

  return (
    <div
      data-selection-menu
      role="dialog"
      aria-label={`Significado de ${word}`}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] text-sm shadow-xl"
      style={{ left, top, width: WIDTH, maxHeight: window.innerHeight - top - SEARCH_PANEL }}
      // Keeps the book's selection while tapping here.
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="flex items-start gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1 font-serif text-[17px] font-semibold break-words">{word}</div>
        <button aria-label="Fechar" className="-mr-1 rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      <div className="overflow-y-auto px-3 py-2">
        <Meanings dict={dict} />
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(`significado de ${word}`)}`}
          target="_blank"
          rel="noreferrer"
          className={`mt-3 flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium ${
            dict.state === 'done' && !dict.result ? 'border-amber-500 bg-amber-500/10 text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)]'
          }`}
        >
          <Search className="size-4" /> Pesquisar na internet
        </a>
      </div>
    </div>
  );
}

function Meanings({ dict }: { dict: Dict }) {
  if (dict.state === 'loading')
    return (
      <p className="flex items-center gap-2 text-[var(--muted)]">
        <Loader2 className="size-4 animate-spin" /> Procurando no dicionário…
      </p>
    );
  if (dict.state === 'error') return <p className="text-[var(--muted)]">Não deu para abrir o dicionário (sem internet?).</p>;
  const { result } = dict;
  if (!result) return <p className="text-[var(--muted)]">Não está no dicionário.</p>;

  const home = result.entries.filter((e) => HOME.includes(e.language));
  // A word of another language only ("though"): its entries are the main ones, with the language named.
  const main = home.length ? home : result.entries;
  const others = home.length ? result.entries.filter((e) => !HOME.includes(e.language)) : [];
  return (
    <div className="flex flex-col gap-2.5">
      <Entries entries={main} named={!home.length} />
      {result.base && (
        <div>
          <div className="mb-1 text-xs text-[var(--muted)]">
            De <span className="font-semibold text-[var(--app-fg)]">{result.base.word}</span>:
          </div>
          <Entries entries={result.base.entries.filter((e) => HOME.includes(e.language)).slice(0, 2)} />
        </div>
      )}
      {others.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted)]">Em outras línguas ({[...new Set(others.map((e) => e.language))].join(', ')})</summary>
          <div className="mt-2">
            <Entries entries={others} named />
          </div>
        </details>
      )}
      <a href={result.url} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-xs text-[var(--muted)] underline-offset-2 hover:underline">
        Wikcionário <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

function Entries({ entries, named = false }: { entries: DictEntry[]; named?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div key={`${e.language}|${e.kind}`}>
          <div className="text-xs text-[var(--muted)] italic">
            {e.kind.toLowerCase()}
            {named && ` · ${e.language}`}
          </div>
          <ol className="mt-0.5 list-decimal space-y-0.5 pl-5 leading-snug marker:text-[var(--muted)]">
            {e.senses.slice(0, SENSES).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
