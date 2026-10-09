import { db, type Folder, type Highlight, type Note, type Notebook, type NoteItem, type NotePage, type Stroke } from '../db/schema';

interface Backup {
  app: 'book-reader';
  /** 1: book annotations only; 2: also notebooks. */
  version: 1 | 2;
  exportedAt: string;
  books: { id: string; title: string; lastPage: number; folderId?: string | null }[];
  bookFolders?: Folder[];
  strokes: Stroke[];
  highlights: Highlight[];
  notes: Note[];
  folders?: Folder[];
  notebooks?: Notebook[];
  notePages?: NotePage[];
  noteItems?: NoteItem[];
  /** Images and imported PDFs of notebooks, as data URLs. */
  noteAssets?: { id: string; notebookId: string; width: number; height: number; data: string }[];
  notebookFiles?: { notebookId: string; data: string }[];
}

async function toDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function fromDataUrl(url: string) {
  const [head, data] = url.split(',', 2);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: head.match(/^data:([^;]+)/)?.[1] });
}

/**
 * Book annotations (not the book files; books are matched by content hash on restore) and
 * notebooks in full, including their pictures and imported PDFs.
 */
export async function createBackup(): Promise<Blob> {
  const [books, bookFolders, strokes, highlights, notes, folders, notebooks, notePages, noteItems, assets] = await Promise.all([
    db.books.toArray(),
    db.bookFolders.toArray(),
    db.strokes.toArray(),
    db.highlights.toArray(),
    db.notes.toArray(),
    db.folders.toArray(),
    db.notebooks.toArray(),
    db.notePages.toArray(),
    db.noteItems.toArray(),
    db.noteAssets.toArray(),
  ]);
  const pdfs = await db.files.bulkGet(notebooks.filter((n) => n.hasPdf).map((n) => n.id));
  const backup: Backup = {
    app: 'book-reader',
    version: 2,
    exportedAt: new Date().toISOString(),
    books: books.map(({ id, title, lastPage, folderId }) => ({ id, title, lastPage, folderId })),
    bookFolders,
    strokes,
    highlights,
    notes,
    folders,
    notebooks,
    notePages,
    noteItems,
    noteAssets: await Promise.all(assets.map(async ({ blob, ...a }) => ({ ...a, data: await toDataUrl(blob) }))),
    notebookFiles: await Promise.all(pdfs.filter((f) => !!f).map(async (f) => ({ notebookId: f!.bookId, data: await toDataUrl(f!.data) }))),
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/** Merges a backup into the database; records with the same id are overwritten. */
export async function restoreBackup(file: Blob) {
  const backup = JSON.parse(await file.text()) as Backup;
  if (backup.app !== 'book-reader') throw new Error('Arquivo de backup inválido');
  const assets = (backup.noteAssets ?? []).map(({ data, ...a }) => ({ ...a, blob: fromDataUrl(data) }));
  const files = (backup.notebookFiles ?? []).map((f) => ({ bookId: f.notebookId, data: fromDataUrl(f.data) }));
  await db.transaction('rw', [db.books, db.bookFolders, db.strokes, db.highlights, db.notes, db.folders, db.notebooks, db.notePages, db.noteItems, db.noteAssets, db.files], async () => {
    await db.folders.bulkPut(backup.folders ?? []);
    await db.bookFolders.bulkPut(backup.bookFolders ?? []);
    await db.notebooks.bulkPut(backup.notebooks ?? []);
    await db.notePages.bulkPut(backup.notePages ?? []);
    await db.noteItems.bulkPut(backup.noteItems ?? []);
    await db.noteAssets.bulkPut(assets);
    await db.files.bulkPut(files);
    await db.strokes.bulkPut(backup.strokes ?? []);
    await db.highlights.bulkPut(backup.highlights ?? []);
    await db.notes.bulkPut(backup.notes ?? []);
    for (const b of backup.books ?? []) {
      const existing = await db.books.get(b.id);
      if (!existing) continue;
      if (existing.lastPage < b.lastPage) await db.books.update(b.id, { lastPage: b.lastPage });
      if (b.folderId) await db.books.update(b.id, { folderId: b.folderId });
    }
  });
  const present = await db.books.bulkGet((backup.books ?? []).map((b) => b.id));
  return {
    annotations: (backup.strokes?.length ?? 0) + (backup.highlights?.length ?? 0) + (backup.notes?.length ?? 0),
    notebooks: backup.notebooks?.length ?? 0,
    /** Books in the backup whose PDF isn't in this library yet; their notes appear once it's imported. */
    missingBooks: (backup.books ?? []).filter((_, i) => !present[i]).map((b) => b.title),
  };
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
