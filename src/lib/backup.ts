import { db, type Highlight, type Note, type Stroke } from '../db/schema';

interface Backup {
  app: 'book-reader';
  version: 1;
  exportedAt: string;
  books: { id: string; title: string; lastPage: number }[];
  strokes: Stroke[];
  highlights: Highlight[];
  notes: Note[];
}

/** Annotations only (no PDF files); books are matched by content hash on restore. */
export async function createBackup(): Promise<Blob> {
  const [books, strokes, highlights, notes] = await Promise.all([
    db.books.toArray(),
    db.strokes.toArray(),
    db.highlights.toArray(),
    db.notes.toArray(),
  ]);
  const backup: Backup = {
    app: 'book-reader',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: books.map(({ id, title, lastPage }) => ({ id, title, lastPage })),
    strokes,
    highlights,
    notes,
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/** Merges a backup into the database; records with the same id are overwritten. */
export async function restoreBackup(file: Blob) {
  const backup = JSON.parse(await file.text()) as Backup;
  if (backup.app !== 'book-reader') throw new Error('Arquivo de backup inválido');
  await db.transaction('rw', [db.books, db.strokes, db.highlights, db.notes], async () => {
    await db.strokes.bulkPut(backup.strokes ?? []);
    await db.highlights.bulkPut(backup.highlights ?? []);
    await db.notes.bulkPut(backup.notes ?? []);
    for (const b of backup.books ?? []) {
      const existing = await db.books.get(b.id);
      if (existing && existing.lastPage < b.lastPage) await db.books.update(b.id, { lastPage: b.lastPage });
    }
  });
  const present = await db.books.bulkGet((backup.books ?? []).map((b) => b.id));
  return {
    annotations: (backup.strokes?.length ?? 0) + (backup.highlights?.length ?? 0) + (backup.notes?.length ?? 0),
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
