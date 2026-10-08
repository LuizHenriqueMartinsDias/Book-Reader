import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PAGE_SIZE, searchArchive, type ArchiveDoc, type Language } from '../../lib/catalog/archive';
import ResultCard from './ResultCard';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'all', label: 'Todos os idiomas' },
  { id: 'por', label: 'Português' },
  { id: 'eng', label: 'Inglês' },
  { id: 'spa', label: 'Espanhol' },
  { id: 'fre', label: 'Francês' },
];

interface Results {
  key: string;
  docs: ArchiveDoc[];
  total: number;
  page: number;
}

/** Search the Internet Archive for free PDFs and download them straight into the library. */
export default function CatalogPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<Language>('por');
  const [openOnly, setOpenOnly] = useState(true);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const key = JSON.stringify([query, language, openOnly]);

  useEffect(() => inputRef.current?.focus(), []);

  async function load(page: number) {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const { docs, total } = await searchArchive({ query, language, openOnly, page }, ctrl.signal);
      setResults((prev) => ({ key, total, page, docs: page > 1 && prev?.key === key ? [...prev.docs, ...docs] : docs }));
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

  const docs = results?.key === key ? results.docs : [];
  const hasMore = results?.key === key && results.page * PAGE_SIZE < results.total;

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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="accent-amber-500" />
            Só domínio público / licença aberta
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        {!query && (
          <div className="mt-10 text-center text-[var(--muted)]">
            <p className="text-base font-medium text-[var(--app-fg)]">Encontre livros gratuitos em PDF</p>
            <p className="mx-auto mt-2 max-w-md text-sm">
              Busca no acervo do Internet Archive. Por padrão aparecem só obras em domínio público ou com licença aberta, que você pode baixar
              e ler à vontade.
            </p>
          </div>
        )}
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {query && results?.key === key && !loading && !docs.length && !error && (
          <p className="mt-10 text-center text-[var(--muted)]">
            Nada encontrado.{openOnly && ' Tente desmarcar o filtro de licença ou mudar o idioma.'}
          </p>
        )}
        {results?.key === key && results.total > 0 && (
          <p className="mb-3 text-xs text-[var(--muted)]">{results.total.toLocaleString('pt-BR')} resultado(s)</p>
        )}
        <div className="grid gap-3">
          {docs.map((doc) => (
            <ResultCard key={doc.identifier} doc={doc} />
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
          Resultados do Internet Archive (archive.org). Respeite os direitos autorais: itens marcados “Verifique os direitos” podem não estar
          liberados no seu país.
        </p>
      </main>
    </div>
  );
}
