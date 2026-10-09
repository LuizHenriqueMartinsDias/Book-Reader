import { db, type Notebook, type NotebookKind, type NoteItem, type NotePage, type Paper } from './schema';
import { newId } from './repo';

export const A4 = { width: 595, height: 842 };

export const COVER_COLORS = ['#1e3a8a', '#7c2d12', '#065f46', '#581c87', '#9f1239', '#334155', '#a16207'];

export interface NewNotebook {
  title: string;
  kind: NotebookKind;
  paper: Paper;
  coverColor: string;
  folderId?: string | null;
  sourceBookId?: string;
  /** Imported PDF: the file and the size of each of its pages. */
  pdf?: { data: Blob; pageSizes: { width: number; height: number }[] };
}

export async function createNotebook(input: NewNotebook) {
  const now = Date.now();
  const notebook: Notebook = {
    id: newId(),
    folderId: input.folderId ?? null,
    title: input.title,
    kind: input.kind,
    paper: input.paper,
    coverColor: input.coverColor,
    hasPdf: !!input.pdf,
    sourceBookId: input.sourceBookId,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  const pages: NotePage[] = input.pdf
    ? input.pdf.pageSizes.map((size, i) => ({ id: newId(), notebookId: notebook.id, order: i, ...size, background: { pdfPage: i + 1 } }))
    : [{ id: newId(), notebookId: notebook.id, order: 0, ...A4 }];
  await db.transaction('rw', db.notebooks, db.notePages, db.files, async () => {
    await db.notebooks.add(notebook);
    await db.notePages.bulkAdd(pages);
    if (input.pdf) await db.files.put({ bookId: notebook.id, data: input.pdf.data });
  });
  navigator.storage?.persist?.().catch(() => {});
  return notebook;
}

export const updateNotebook = (id: string, changes: Partial<Notebook>) => db.notebooks.update(id, { ...changes, updatedAt: Date.now() });

export const touchNotebook = (id: string) => db.notebooks.update(id, { updatedAt: Date.now() });

export async function deleteNotebook(id: string) {
  await db.transaction('rw', [db.notebooks, db.notePages, db.noteItems, db.noteAssets, db.files], async () => {
    await db.notePages.where('notebookId').equals(id).delete();
    await db.noteItems.where('notebookId').equals(id).delete();
    await db.noteAssets.where('notebookId').equals(id).delete();
    await db.files.delete(id);
    await db.notebooks.delete(id);
  });
}

export const getPages = (notebookId: string) => db.notePages.where('[notebookId+order]').between([notebookId, -Infinity], [notebookId, Infinity]).toArray();

/** Inserts a blank page after `afterOrder` (or at the end), shifting later pages down. */
export async function addPage(notebookId: string, afterOrder?: number) {
  return db.transaction('rw', db.notePages, db.notebooks, async () => {
    const pages = await getPages(notebookId);
    const at = afterOrder === undefined ? pages.length : afterOrder + 1;
    const template = pages[Math.min(Math.max(at - 1, 0), pages.length - 1)];
    const size = template && !template.background ? { width: template.width, height: template.height } : A4;
    for (const p of pages) if (p.order >= at) await db.notePages.update(p.id, { order: p.order + 1 });
    const page: NotePage = { id: newId(), notebookId, order: at, ...size };
    await db.notePages.add(page);
    await db.notebooks.update(notebookId, { updatedAt: Date.now() });
    return page;
  });
}

export async function deletePage(page: NotePage) {
  await db.transaction('rw', db.notePages, db.noteItems, async () => {
    await db.noteItems.where('pageId').equals(page.id).delete();
    await db.notePages.delete(page.id);
    const rest = await getPages(page.notebookId);
    for (const [i, p] of rest.entries()) if (p.order !== i) await db.notePages.update(p.id, { order: i });
  });
}

export async function movePage(page: NotePage, delta: -1 | 1) {
  await db.transaction('rw', db.notePages, async () => {
    const pages = await getPages(page.notebookId);
    const i = pages.findIndex((p) => p.id === page.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= pages.length) return;
    await db.notePages.update(pages[i].id, { order: j });
    await db.notePages.update(pages[j].id, { order: i });
  });
}

/** Next stacking order on a page. */
export async function nextZ(pageId: string) {
  const items = await db.noteItems.where('pageId').equals(pageId).toArray();
  return items.reduce((m, i) => Math.max(m, i.z), 0) + 1;
}

/** Notebooks whose title or typed text matches, most recently edited first. */
export async function searchNotebooks(query: string) {
  const q = query.trim().toLowerCase();
  const notebooks = await db.notebooks.orderBy('updatedAt').reverse().toArray();
  if (!q) return notebooks;
  const textHits = new Set(
    (await db.noteItems.filter((i: NoteItem) => i.type === 'text' && i.text.toLowerCase().includes(q)).toArray()).map((i) => i.notebookId),
  );
  return notebooks.filter((n) => n.title.toLowerCase().includes(q) || textHits.has(n.id));
}
