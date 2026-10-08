import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchArchiveItems } from '../../lib/catalog/archive';
import { searchGutenberg } from '../../lib/catalog/gutenberg';
import type { CatalogItem, Language } from '../../lib/catalog/types';
import ResultCard from './ResultCard';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'all', label: 'Todos os idiomas' },
  { id: 'por', label: 'Português' },
  { id: 'eng', label: 'Inglês' },
  { id: 'spa', label: 'Espanhol' },
  { id: 'fre', label: 'Francês' },
];

type Source = 'archive' | 'gutenberg';

const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: 'archive', label: 'Internet Archive', hint: 'PDFs e EPUBs, inclusive livros escaneados' },
  { id: 'gutenberg', label: 'Project Gutenberg', hint: 'Clássicos em EPUB, revisados e leves' },
];

interface Results {
  key: string;
  items: CatalogItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

/** Search free-book catalogs and download PDFs/EPUBs straight into the library. */
export default function CatalogPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<Language>('por');
  const [openOnly, setOpenOnly] = useState(true);
  const [source, setSource] = useState<Source>('archive');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const key = JSON.stringify([source, query, language, source === 'archive' && openOnly]);

  useEffect(() => inputRef.current?.focus(), []);

  async function load(page: number) {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const found =
        source === 'archive'
          ? await searchArchiveItems({ query, language, openOnly, page }, ctrl.signal)
          : await searchGutenberg({ query, language, page }, ctrl.signal);
      setResults((prev) => ({
        key,
        total: found.total,
        page,
        hasMore: found.hasMore,
        items: page > 1 && prev?.key === key ? [...prev.items, ...found.items] : found.items,
      }));
    } catch (e) {
      if (!ctrl.signal.aborted) setError(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : 'Sem conexão com a internet.');
    } finally {
      if (request.current === ctrl) setLoading(false);
    }
  }

  // Search again whenever the submitted query or a filter changes.
  useEffect(() => {
    if (query) load(1);
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const items = results?.key === key ? results.items : [];
  const hasMore = results?.key === key && results.hasMore;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <a href="#/" className="rounded-md p-2 hover:bg-[var(--app-bg)]" title="Voltar à estante">
            <ArrowLeft className="size-5" />
          </a>
          <form
            className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--app-bg)] px-3 focus-within:border-amber-500"
            onSubmit={(e) => {
              e.preventDefault();
              const q = input.trim();
              if (q === query && q) load(1);
              setQuery(q);
              inputRef.current?.blur();
            }}
          >
            <Search className="size-4 shrink-0 text-[var(--muted)]" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="search"
              enterKeyHint="search"
              placeholder="Título, autor ou assunto…"
              className="min-w-0 flex-1 bg-transparent py-2 outline-none"
            />
          </form>
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl gap-1 pl-11 text-sm">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              title={s.hint}
              onClick={() => setSource(s.id)}
              className={`rounded-full border px-3 py-1 ${source === s.id ? 'border-amber-500 bg-amber-500/10 font-medium' : 'border-[var(--border)] text-[var(--muted)]'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 pl-11 text-sm">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1"
            aria-label="Idioma"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          {source === 'archive' && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="accent-amber-500" />
              Só domínio público / licença aberta
            </label>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        {!query && (
          <div className="mt-10 text-center text-[var(--muted)]">
            <p className="text-base font-medium text-[var(--app-fg)]">Encontre livros gratuitos em PDF e EPUB</p>
            <p className="mx-auto mt-2 max-w-md text-sm">
              Busca no Internet Archive (por padrão, só obras em domínio público ou com licença aberta) e no Project Gutenberg (clássicos em
              domínio público). Tudo pode ser baixado e lido à vontade.
            </p>
          </div>
        )}
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {query && results?.key === key && !loading && !items.length && !error && (
          <p className="mt-10 text-center text-[var(--muted)]">
            Nada encontrado.{source === 'archive' && openOnly ? ' Tente desmarcar o filtro de licença ou mudar o idioma.' : ' Tente outro idioma ou a outra fonte.'}
          </p>
        )}
        {results?.key === key && results.total > 0 && (
          <p className="mb-3 text-xs text-[var(--muted)]">{results.total.toLocaleString('pt-BR')} resultado(s)</p>
        )}
        <div className="grid gap-3">
          {items.map((item) => (
            <ResultCard key={item.key} item={item} />
          ))}
        </div>
        {loading && <Loader2 className="mx-auto my-8 size-6 animate-spin text-[var(--muted)]" />}
        {hasMore && !loading && (
          <button
            onClick={() => load(results!.page + 1)}
            className="mx-auto mt-4 block rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--panel)]"
          >
            Carregar mais
          </button>
        )}
        <p className="mt-8 text-center text-xs text-[var(--muted)]">
          Resultados do Internet Archive (archive.org) e do Project Gutenberg (gutenberg.org). Respeite os direitos autorais: itens marcados
          “Verifique os direitos” podem não estar liberados no seu país.
        </p>
      </main>
    </div>
  );
}
