import { ArrowLeft, Clock, Search, Tag, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { rememberedItems } from '../../lib/catalog/browse';
import type { Language } from '../../lib/catalog/types';
import { Cover } from './BookTile';
import { catalogHref } from './routes';
import { LANGUAGES, useCatalogSettings } from './settings';
import { fold, suggest } from './suggest';

/**
 * Search box and filters on every catalog screen, with an arrow back a screen except on the
 * catalog's home (a main screen, reached from the app's navigation).
 */
export default function CatalogHeader({ query = '', home = false, autoFocus = false }: { query?: string; home?: boolean; autoFocus?: boolean }) {
  const [input, setInput] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const { language, setLanguage, openOnly, setOpenOnly, addRecent } = useCatalogSettings();

  const [focused, setFocused] = useState(false);

  function go(text: string) {
    const q = text.trim();
    if (!q) return;
    addRecent(q);
    setInput(q);
    inputRef.current?.blur();
    navigate(catalogHref.search(q));
  }

  function back() {
    if (history.length > 1) history.back();
    else navigate(catalogHref.home);
  }

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        {!home && (
          <button onClick={back} className="rounded-md p-2 hover:bg-[var(--app-bg)]" title="Voltar">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="relative flex-1">
          <form
            className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--app-bg)] px-4 focus-within:border-amber-500"
            onSubmit={(e) => {
              e.preventDefault();
              go(input);
            }}
          >
            <Search className="size-4 shrink-0 text-[var(--muted)]" />
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()}
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
          {focused && <SuggestionPanel input={input} onSearch={go} />}
        </div>
      </div>
      <div className={`mx-auto mt-2 flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 text-sm ${home ? '' : 'pl-11'}`}>
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

/** The typed text in bold within a suggestion. */
function Match({ text, input }: { text: string; input: string }) {
  const at = fold(text).indexOf(fold(input.trim()));
  if (!input.trim() || at < 0) return <>{text}</>;
  const end = at + input.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold">{text.slice(at, end)}</b>
      {text.slice(end)}
    </>
  );
}

const row = 'flex min-h-11 w-full items-center gap-3 px-4 py-1.5 text-left text-[15px] hover:bg-[var(--app-bg)]';
const heading = 'px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase';

/** Suggestions under the search box while it has focus: past searches, authors, genres, books seen. */
function SuggestionPanel({ input, onSearch }: { input: string; onSearch: (q: string) => void }) {
  const recentSearches = useCatalogSettings((s) => s.recentSearches);
  const s = suggest(input, recentSearches, rememberedItems());
  const q = input.trim();
  if (!q && !s.recent.length) return null;
  const open = (href: string) => navigate(href);

  return (
    // mousedown would blur the input (closing this) before the click lands.
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2 shadow-xl"
    >
      {!!s.recent.length && (
        <>
          <div className={heading}>Buscas recentes</div>
          {s.recent.map((r) => (
            <button key={r} className={row} onClick={() => onSearch(r)}>
              <Clock className="size-4 shrink-0 text-[var(--muted)]" />
              <span className="truncate">
                <Match text={r} input={input} />
              </span>
            </button>
          ))}
        </>
      )}
      {!!s.authors.length && (
        <>
          <div className={heading}>Autores</div>
          {s.authors.map((a) => (
            <button key={a} className={row} onClick={() => open(catalogHref.author(a))}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-serif text-xs font-bold text-[var(--accent-text)]">
                {a
                  .split(' ')
                  .filter((w) => w.length > 2)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('')}
              </span>
              <span className="truncate">
                <Match text={a} input={input} />
              </span>
            </button>
          ))}
        </>
      )}
      {!!s.genres.length && (
        <>
          <div className={heading}>Gêneros</div>
          {s.genres.map((g) => (
            <button key={g.id} className={row} onClick={() => open(catalogHref.category(g.id))}>
              <Tag className="size-4 shrink-0 text-[var(--muted)]" />
              <Match text={g.label} input={input} />
            </button>
          ))}
        </>
      )}
      {!!s.books.length && (
        <>
          <div className={heading}>Livros</div>
          {s.books.map((b) => (
            <button key={b.key} className={row} onClick={() => open(catalogHref.book(b.key))}>
              <Cover item={b} className="aspect-[2/3] w-8 shrink-0 rounded-sm" />
              <span className="min-w-0">
                <span className="block truncate">
                  <Match text={b.title} input={input} />
                </span>
                <span className="block truncate text-xs text-[var(--muted)]">{b.authors}</span>
              </span>
            </button>
          ))}
        </>
      )}
      {q && (
        <button className={`${row} mt-1 font-medium text-[var(--accent-text)]`} onClick={() => onSearch(q)}>
          <Search className="size-4 shrink-0" /> Ver todos os resultados para “{q}”
        </button>
      )}
    </div>
  );
}
