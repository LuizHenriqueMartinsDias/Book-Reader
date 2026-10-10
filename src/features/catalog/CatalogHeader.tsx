import { ArrowLeft, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import type { Language } from '../../lib/catalog/types';
import { catalogHref } from './routes';
import { LANGUAGES, useCatalogSettings } from './settings';

/**
 * Search box and filters on every catalog screen. The arrow goes back a screen, or to the
 * library from the catalog's home.
 */
export default function CatalogHeader({ query = '', home = false, autoFocus = false }: { query?: string; home?: boolean; autoFocus?: boolean }) {
  const [input, setInput] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const { language, setLanguage, openOnly, setOpenOnly, addRecent } = useCatalogSettings();

  function back() {
    if (home) navigate('#/');
    else if (history.length > 1) history.back();
    else navigate(catalogHref.home);
  }

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        <button onClick={back} className="rounded-md p-2 hover:bg-[var(--app-bg)]" title={home ? 'Voltar à estante' : 'Voltar'}>
          <ArrowLeft className="size-5" />
        </button>
        <form
          className="flex flex-1 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--app-bg)] px-4 focus-within:border-amber-500"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.trim();
            if (!q) return;
            addRecent(q);
            inputRef.current?.blur();
            navigate(catalogHref.search(q));
          }}
        >
          <Search className="size-4 shrink-0 text-[var(--muted)]" />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Buscar título, autor ou assunto"
            className="min-w-0 flex-1 bg-transparent py-2 outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button
              type="button"
              title="Limpar"
              onClick={() => {
                setInput('');
                inputRef.current?.focus();
              }}
              className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--panel)]"
            >
              <X className="size-4" />
            </button>
          )}
        </form>
      </div>
      <div className="mx-auto mt-2 flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 pl-11 text-sm">
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
        <label className="flex items-center gap-2" title="Vale para o Internet Archive; o Project Gutenberg só tem obras livres">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="accent-amber-500" />
          Só domínio público / licença aberta
        </label>
      </div>
    </header>
  );
}
