import { BookOpen } from 'lucide-react';
import { useEffect } from 'react';
import { takeSharedFiles } from '../../lib/sharedFiles';
import { useToast } from '../Toast';
import { importBook, isBookFile, type ImportResult } from './importBook';

/** Where to go after importing books that came from outside the app, and what to say. */
export interface Outcome {
  /** The book to open: the only one received. */
  open?: string;
  message: string | null;
}

/** Imports books received from another app or the system, one at a time. */
export async function importReceived(files: File[], importer: (f: File) => Promise<ImportResult> = importBook): Promise<Outcome> {
  const books = files.filter(isBookFile);
  if (!books.length) return { message: 'Nenhum PDF ou EPUB recebido.' };
  const results: ImportResult[] = [];
  for (const f of books) results.push(await importer(f));
  if (results.length === 1 && results[0].status !== 'error') {
    return { open: results[0].id, message: results[0].status === 'exists' ? 'Esse livro já estava na estante.' : null };
  }
  const titles = (status: 'added' | 'exists') => results.flatMap((r) => (r.status === status ? [r.title] : []));
  const added = titles('added');
  const existing = titles('exists');
  const errors = results.flatMap((r) => (r.status === 'error' ? [r.name] : []));
  return {
    message:
      [
        added.length && (added.length === 1 ? `Adicionado: ${added[0]}` : `${added.length} livros adicionados`),
        existing.length && `Já estava na estante: ${existing.join(', ')}`,
        errors.length && `Falha ao importar: ${errors.join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · ') || null,
  };
}

/** Goes to the book, or back to the shelf, without leaving the import screen in the history. */
function finish({ open, message }: Outcome) {
  location.replace(open ? `#/read/${encodeURIComponent(open)}` : '#/');
  if (message) useToast.getState().show(message);
}

let pending: Promise<Outcome> | null = null;

/**
 * #/compartilhado: where the service worker sends the app after Android's "Share → Book Reader";
 * imports the books it parked and moves on.
 */
export default function SharedImport() {
  useEffect(() => {
    // Once, though React's strict mode runs effects twice in development.
    pending ??= takeSharedFiles().then((files) => importReceived(files));
    pending.then(finish, (e) => finish({ message: `Falha ao receber o livro: ${e instanceof Error ? e.message : e}` })).finally(() => (pending = null));
  }, []);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 text-[var(--muted)]">
      <BookOpen className="size-10 animate-pulse" />
      <span>Adicionando à estante…</span>
    </div>
  );
}

interface LaunchParams {
  files: FileSystemFileHandle[];
}

/** Computers: PDFs and EPUBs opened with the installed app ("Open with → Book Reader", manifest `file_handlers`). */
export function receiveOpenedFiles() {
  const queue = (window as unknown as { launchQueue?: { setConsumer(c: (p: LaunchParams) => void): void } }).launchQueue;
  queue?.setConsumer(async ({ files }) => {
    if (!files.length) return;
    useToast.getState().show('Adicionando à estante…');
    finish(await importReceived(await Promise.all(files.map((h) => h.getFile()))));
  });
}
