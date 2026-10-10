import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { dedupe } from '../../lib/catalog/archive';
import { browse, remember, supports } from '../../lib/catalog/browse';
import type { BrowseFilter, BrowseQuery, CatalogItem, Language, Source } from '../../lib/catalog/types';

interface SourceList {
  items: CatalogItem[];
  /** Pages loaded so far (0: none yet). */
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: SourceList = { items: [], page: 0, hasMore: false, loading: false, error: null };

type Lists = Partial<Record<Source, SourceList>>;

// Lists stay loaded for the session, so going back to them is instant and keeps the scroll position.
const lists = new Map<string, Lists>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const current = (key: string, source: Source) => lists.get(key)?.[source] ?? EMPTY;

function update(key: string, source: Source, patch: (l: SourceList) => Partial<SourceList>) {
  const prev = current(key, source);
  lists.set(key, { ...lists.get(key), [source]: { ...prev, ...patch(prev) } });
  listeners.forEach((l) => l());
}

// The request each list is waiting for; one whose screen closed (aborted) gives way to a new one.
const inflight = new Map<string, AbortSignal>();

async function loadPage(key: string, query: BrowseQuery, page: number, signal: AbortSignal) {
  const id = `${key}|${query.source}`;
  const pending = inflight.get(id);
  if (pending && !pending.aborted) return;
  inflight.set(id, signal);
  update(key, query.source, () => ({ loading: true, error: null }));
  try {
    const found = await browse(query, page, signal);
    if (inflight.get(id) !== signal) return;
    inflight.delete(id);
    remember(found.items);
    update(key, query.source, (l) => ({
      items: page === 1 ? found.items : query.source === 'archive' ? dedupe([...l.items, ...found.items]) : [...l.items, ...found.items],
      page,
      hasMore: found.hasMore && found.items.length > 0,
      loading: false,
    }));
  } catch (e) {
    if (inflight.get(id) !== signal) return;
    inflight.delete(id);
    const error = signal.aborted ? null : navigator.onLine ? (e instanceof Error ? e.message : String(e)) : 'Sem conexão com a internet.';
    update(key, query.source, () => ({ loading: false, error }));
  }
}

/** Alternates the catalogs' results, without repeating a book. */
function interleave(groups: CatalogItem[][]) {
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (let i = 0; i < Math.max(0, ...groups.map((g) => g.length)); i++)
    for (const g of groups)
      if (g[i] && !seen.has(g[i].key)) {
        seen.add(g[i].key);
        out.push(g[i]);
      }
  return out;
}

/** Pages through the catalogs that support `filter`, mixing their results. */
export function useCatalogList(filter: BrowseFilter, sources: Source[], language: Language, openOnly: boolean) {
  const queries = useMemo(
    () => sources.filter((s) => supports(s, filter)).map((source): BrowseQuery => ({ ...filter, source, language, openOnly })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify([filter, sources, language, openOnly])],
  );
  const key = JSON.stringify(queries);
  const state = useSyncExternalStore(subscribe, () => lists.get(key));
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    ctrl.current = c;
    for (const q of queries) if (!current(key, q.source).page) loadPage(key, q, 1, c.signal);
    return () => c.abort();
  }, [key, queries]);

  const perSource = queries.map((q) => ({ source: q.source, ...(state?.[q.source] ?? EMPTY) }));
  const items = useMemo(() => interleave(perSource.map((l) => l.items)), [state, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    perSource,
    loading: perSource.some((l) => l.loading),
    /** Every catalog answered (or failed) at least once. */
    settled: perSource.every((l) => l.page > 0 || (!l.loading && l.error !== null)),
    hasMore: perSource.some((l) => l.hasMore),
    errors: perSource.filter((l) => l.error).map((l) => ({ source: l.source, message: l.error! })),
    loadMore() {
      for (const q of queries) {
        const l = current(key, q.source);
        if (ctrl.current && (l.error || (l.hasMore && !l.loading))) loadPage(key, q, l.page + 1, ctrl.current.signal);
      }
    },
  };
}
