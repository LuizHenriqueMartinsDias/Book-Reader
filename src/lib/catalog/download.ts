/** Proxy that adds CORS headers to Internet Archive files (see worker/). Empty when not configured. */
export const PROXY_URL = (import.meta.env.VITE_PROXY_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface Progress {
  loaded: number;
  total: number | null;
}

/** Downloads a PDF through the proxy, reporting progress; abort with `signal`. */
export async function downloadPdf(url: string, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<Blob> {
  if (!PROXY_URL) throw new Error('Download direto não configurado');
  if (!navigator.onLine) throw new Error('Sem conexão com a internet');
  const res = await fetch(`${PROXY_URL}/fetch?url=${encodeURIComponent(url)}`, { signal });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Falha no download (${res.status})`);
  const total = Number(res.headers.get('Content-Length')) || null;
  if (!res.body) return res.blob();

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  onProgress({ loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress({ loaded, total });
  }
  return new Blob(chunks, { type: 'application/pdf' });
}

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
