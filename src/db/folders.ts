import { db, type Folder } from './schema';
import { newId } from './repo';

/** Folders group notebooks (Cadernos) or books (Biblioteca); each kind has its own. */
export type FolderKind = 'notebooks' | 'books';

export const FOLDER_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];

const tables = (kind: FolderKind) => (kind === 'books' ? { folders: db.bookFolders, items: db.books } : { folders: db.folders, items: db.notebooks });

export async function createFolder(kind: FolderKind, name: string, color: string) {
  const { folders } = tables(kind);
  const last = await folders.orderBy('order').last();
  const folder: Folder = { id: newId(), name, color, order: (last?.order ?? 0) + 1, createdAt: Date.now() };
  await folders.add(folder);
  return folder;
}

export const updateFolder = (kind: FolderKind, id: string, changes: Partial<Folder>) => tables(kind).folders.update(id, changes);

/** Deleting a folder keeps what was in it; it just leaves the folder. */
export async function deleteFolder(kind: FolderKind, id: string) {
  const { folders, items } = tables(kind);
  await db.transaction('rw', folders, items, async () => {
    // Two tables with different record types: the same change, written for each.
    if (kind === 'books') await db.books.where('folderId').equals(id).modify({ folderId: null });
    else await db.notebooks.where('folderId').equals(id).modify({ folderId: null });
    await folders.delete(id);
  });
}
