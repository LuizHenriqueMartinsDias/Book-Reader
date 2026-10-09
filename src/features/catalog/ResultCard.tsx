import { BookOpen, Check, Download, ExternalLink, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { navigate } from '../../App';
import { downloadBook, formatBytes, PROXY_URL, type Progress } from '../../lib/catalog/download';
import type { CatalogItem } from '../../lib/catalog/types';
import { importBook } from '../library/importBook';

type State =
  | { status: 'idle' }
  | { status: 'resolving' }
  | { status: 'downloading'; progress: Progress }
  | { status: 'saving' }
  | { status: 'done'; bookId: string; existed: boolean }
  | { status: 'error'; message: string };

const RIGHTS_STYLE = {
  'public-domain': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'open-license': 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  unknown: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export default function ResultCard({ item }: { item: CatalogItem }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const { rights, year, title } = item;

  async function download() {
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      setState({ status: 'resolving' });
      const file = await item.resolveFile(ctrl.signal);
      if (!file) throw new Error('Este item não tem PDF nem EPUB');
      const blob = await downloadBook(file.url, (progress) => setState({ status: 'downloading', progress: { ...progress, total: progress.total ?? file.size } }), ctrl.signal);
      setState({ status: 'saving' });
      const result = await importBook(new File([blob], file.name, { type: blob.type }), { title });
      if (result.status === 'error') throw new Error(`O arquivo baixado não abriu (${result.error})`);
      setState({ status: 'done', bookId: result.id, existed: result.status === 'exists' });
    } catch (e) {
      if (ctrl.signal.aborted) return setState({ status: 'idle' });
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      abort.current = null;
    }
  }

  const busy = state.status === 'resolving' || state.status === 'downloading' || state.status === 'saving';
  const progress = state.status === 'downloading' ? state.progress : null;
  const fraction = progress?.total ? progress.loaded / progress.total : null;

  return (
    <article className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
      <a href={item.pageUrl} target="_blank" rel="noreferrer" className="shrink-0">
        {item.cover ? (
          <img src={item.cover} alt="" loading="lazy" className="h-28 w-20 rounded bg-[var(--app-bg)] object-cover shadow-sm" />
        ) : (
          <div className="h-28 w-20 rounded bg-[var(--app-bg)]" />
        )}
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 font-medium leading-snug" title={title}>
          {title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-sm text-[var(--muted)]">
          {[item.authors, year].filter(Boolean).join(' · ') || 'Autor desconhecido'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${RIGHTS_STYLE[rights.kind]}`}>{rights.label}</span>
          {!!item.downloads && <span className="text-[var(--muted)]">{item.downloads.toLocaleString('pt-BR')} downloads</span>}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-sm">
          {!PROXY_URL ? (
            <a href={item.pageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-medium text-stone-900">
              <ExternalLink className="size-4" /> Abrir no site
            </a>
          ) : state.status === 'done' ? (
            <button onClick={() => navigate(`#/read/${state.bookId}`)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white">
              {state.existed ? <Check className="size-4" /> : <BookOpen className="size-4" />}
              {state.existed ? 'Já está na estante · Abrir' : 'Ler agora'}
            </button>
          ) : busy ? (
            <>
              <div className="flex min-w-36 flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className={`h-full bg-amber-500 transition-[width] ${fraction === null ? 'w-1/3 animate-pulse' : ''}`}
                    style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--muted)] tabular-nums">
                  {state.status === 'resolving' && 'Preparando…'}
                  {state.status === 'saving' && 'Salvando…'}
                  {progress && `${formatBytes(progress.loaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}`}
                </span>
              </div>
              {state.status !== 'saving' && (
                <button title="Cancelar" onClick={() => abort.current?.abort()} className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--app-bg)]">
                  <X className="size-4" />
                </button>
              )}
            </>
          ) : (
            <button onClick={download} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-medium text-stone-900 hover:bg-amber-400">
              <Download className="size-4" /> Baixar
            </button>
          )}
          {PROXY_URL && (
            <a href={item.pageUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--muted)] hover:underline">
              Ver no site
            </a>
          )}
        </div>
        {state.status === 'error' && <p className="mt-1.5 text-xs text-red-600">{state.message}</p>}
      </div>
    </article>
  );
}
