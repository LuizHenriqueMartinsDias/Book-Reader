import { BookOpen, Check, Download, ExternalLink, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { navigate } from '../../App';
import { resolveFile } from '../../lib/catalog/browse';
import { downloadBook, formatBytes, PROXY_URL, type Progress } from '../../lib/catalog/download';
import type { BookFile, CatalogItem } from '../../lib/catalog/types';
import { importBook } from '../library/importBook';

type State =
  | { status: 'idle' }
  | { status: 'resolving' }
  | { status: 'downloading'; progress: Progress }
  | { status: 'saving' }
  | { status: 'done'; bookId: string; existed: boolean }
  | { status: 'error'; message: string };

const IDLE: State = { status: 'idle' };

// Downloads keep going when their screen closes and show up again, with their progress, when it reopens.
const downloads = new Map<string, State>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(key: string, state: State) {
  downloads.set(key, state);
  listeners.forEach((l) => l());
}

async function download(item: CatalogItem, file?: BookFile | null) {
  const ctrl = new AbortController();
  controllers.set(item.key, ctrl);
  const set = (s: State) => setState(item.key, s);
  try {
    set({ status: 'resolving' });
    const found = file ?? (await resolveFile(item, ctrl.signal));
    if (!found) throw new Error('Este item não tem PDF nem EPUB');
    const blob = await downloadBook(found.url, (progress) => set({ status: 'downloading', progress: { ...progress, total: progress.total ?? found.size } }), ctrl.signal);
    set({ status: 'saving' });
    const result = await importBook(new File([blob], found.name, { type: blob.type }), { title: item.title, catalogKey: item.key });
    if (result.status === 'error') throw new Error(`O arquivo baixado não abriu (${result.error})`);
    set({ status: 'done', bookId: result.id, existed: result.status === 'exists' });
  } catch (e) {
    set(ctrl.signal.aborted ? IDLE : { status: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    controllers.delete(item.key);
  }
}

/**
 * Downloads a book into the library, or opens it when it's already there (`bookId`).
 * `file` skips looking the file up again when the caller already knows it.
 */
export default function DownloadButton({
  item,
  bookId,
  file,
  large = false,
}: {
  item: CatalogItem;
  bookId?: string;
  file?: BookFile | null;
  large?: boolean;
}) {
  const state = useSyncExternalStore(subscribe, () => downloads.get(item.key) ?? IDLE);

  const size = large ? 'px-5 py-2.5 text-base' : 'px-3 py-1.5 text-sm';
  const busy = state.status === 'resolving' || state.status === 'downloading' || state.status === 'saving';
  const progress = state.status === 'downloading' ? state.progress : null;
  const fraction = progress?.total ? progress.loaded / progress.total : null;
  const openId = state.status === 'done' ? state.bookId : bookId;

  if (!PROXY_URL)
    return (
      <a href={item.pageUrl} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 font-medium text-stone-900 ${size}`}>
        <ExternalLink className="size-4" /> Abrir no site
      </a>
    );

  if (openId)
    return (
      <button onClick={() => navigate(`#/read/${openId}`)} className={`flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 font-medium text-white ${size}`}>
        {state.status === 'done' && !state.existed ? <BookOpen className="size-4" /> : <Check className="size-4" />}
        {state.status === 'done' && !state.existed ? 'Ler agora' : 'Na estante · Abrir'}
      </button>
    );

  if (busy)
    return (
      <div className={`flex min-w-40 items-center gap-2 ${large ? 'py-2.5' : 'py-1.5'}`}>
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
        {state.status !== 'saving' && (
          <button title="Cancelar" onClick={() => controllers.get(item.key)?.abort()} className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--app-bg)]">
            <X className="size-4" />
          </button>
        )}
      </div>
    );

  return (
    <div>
      <button onClick={() => download(item, file)} className={`flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 font-medium text-stone-900 hover:bg-amber-400 ${size}`}>
        <Download className="size-4" />
        {state.status === 'error' ? 'Tentar de novo' : 'Baixar'}
        {large && file && <span className="font-normal opacity-75">· {file.format.toUpperCase()}{file.size ? `, ${formatBytes(file.size)}` : ''}</span>}
      </button>
      {state.status === 'error' && <p className="mt-1.5 text-xs text-red-600">{state.message}</p>}
    </div>
  );
}
