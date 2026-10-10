/**
 * Books shared to the app from other apps (Android's "Share" → Book Reader). The service worker
 * receives them in a POST, which the page can't see, so it parks them here for the page to import.
 */
const CACHE = 'shared-books';
const NAME_HEADER = 'X-File-Name';

/** Service worker side: keeps the shared files until the page takes them. */
export async function saveSharedFiles(files: File[], base: string) {
  const cache = await caches.open(CACHE);
  const stamp = Date.now();
  await Promise.all(
    files.map((f, i) =>
      cache.put(
        new Request(new URL(`shared-books/${stamp}-${i}`, base).href),
        new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', [NAME_HEADER]: encodeURIComponent(f.name) } }),
      ),
    ),
  );
}

/** Page side: the files waiting to be imported, oldest first, removed from the cache. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === 'undefined' || !(await caches.has(CACHE))) return [];
  const cache = await caches.open(CACHE);
  const files: File[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response) {
      const name = decodeURIComponent(response.headers.get(NAME_HEADER) ?? 'livro');
      files.push(new File([await response.blob()], name, { type: response.headers.get('Content-Type') ?? '' }));
    }
    await cache.delete(request);
  }
  return files;
}
