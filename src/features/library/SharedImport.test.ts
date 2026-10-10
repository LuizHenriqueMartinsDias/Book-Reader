import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveSharedFiles, takeSharedFiles } from '../../lib/sharedFiles';
import type { ImportResult } from './importBook';
import { importReceived } from './SharedImport';

/** Cache Storage as the service worker and the page share it (jsdom has none). */
class FakeCaches {
  stores = new Map<string, Map<string, Response>>();
  async has(name: string) {
    return this.stores.has(name);
  }
  async open(name: string) {
    const store = this.stores.get(name) ?? new Map<string, Response>();
    this.stores.set(name, store);
    return {
      put: async (req: Request, res: Response) => void store.set(req.url, res),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      match: async (req: Request) => store.get(req.url)?.clone(),
      delete: async (req: Request) => store.delete(req.url),
    };
  }
}

describe('shared files', () => {
  const g = globalThis as unknown as { caches?: unknown };
  beforeEach(() => {
    g.caches = new FakeCaches();
  });
  afterEach(() => {
    delete g.caches;
  });

  it('hands the page what the service worker received, once', async () => {
    await saveSharedFiles([new File(['%PDF'], 'Ação & Reação.pdf', { type: 'application/pdf' }), new File(['PK'], 'b.epub', { type: 'application/epub+zip' })], 'http://localhost/Book-Reader/');
    const files = await takeSharedFiles();
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['Ação & Reação.pdf', 'application/pdf'],
      ['b.epub', 'application/epub+zip'],
    ]);
    expect(files[0].size).toBe(4);
    expect(await takeSharedFiles()).toEqual([]);
  });

  it('finds nothing when nothing was shared', async () => {
    expect(await takeSharedFiles()).toEqual([]);
  });
});

describe('importing received books', () => {
  const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' });
  const importer = async (f: File): Promise<ImportResult> =>
    f.name.startsWith('bad') ? { status: 'error', name: f.name, error: 'x' } : { status: f.name.startsWith('old') ? 'exists' : 'added', id: `id-${f.name}`, title: f.name.replace('.pdf', '') };

  it('opens a single book', async () => {
    expect(await importReceived([pdf('a.pdf')], importer)).toEqual({ open: 'id-a.pdf', message: null });
    expect(await importReceived([pdf('old.pdf')], importer)).toEqual({ open: 'id-old.pdf', message: 'Esse livro já estava na estante.' });
  });

  it('sums up several books on the shelf', async () => {
    expect(await importReceived([pdf('a.pdf'), pdf('b.pdf'), pdf('old.pdf'), pdf('bad.pdf')], importer)).toEqual({
      message: '2 livros adicionados · Já estava na estante: old · Falha ao importar: bad.pdf',
    });
    expect((await importReceived([pdf('bad.pdf')], importer)).open).toBeUndefined();
  });

  it('ignores files that are not books', async () => {
    expect(await importReceived([new File(['x'], 'foto.jpg', { type: 'image/jpeg' })], importer)).toEqual({ message: 'Nenhum PDF ou EPUB recebido.' });
  });
});
