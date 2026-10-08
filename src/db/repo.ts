import { db, type Book, type Note } from './schema';

export const newId = () => crypto.randomUUID();

export async function addBook(book: Book, data: Blob) {
  await db.transaction('rw', db.books, db.files, async () => {
    await db.books.add(book);
    await db.files.add({ bookId: book.id, data });
  });
}

export async function getBookFile(bookId: string) {
  return (await db.files.get(bookId))?.data;
}

export function updateBook(id: string, changes: Partial<Book>) {
  return db.books.update(id, changes);
}

export async function deleteBook(id: string) {
  await db.transaction('rw', [db.books, db.files, db.strokes, db.highlights, db.notes], async () => {
    await db.books.delete(id);
    await db.files.delete(id);
    await db.strokes.where('bookId').equals(id).delete();
    await db.highlights.where('bookId').equals(id).delete();
    await db.notes.where('bookId').equals(id).delete();
  });
}

// Strokes and highlights are written through store/history so they can be undone.

export const putNote = (n: Note) => db.notes.put(n);
export const deleteNote = (id: string) => db.notes.delete(id);
