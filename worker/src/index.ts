import { allowedOrigin, isAllowedTarget, isPdfResponse } from './validate';

const MAX_REDIRECTS = 5;
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * CORS proxy for the Book Reader app: GET /fetch?url=<pdf url> streams a PDF from an allowed
 * host (the Internet Archive doesn't send CORS headers on files, so browsers can't fetch them).
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const origin = allowedOrigin(request.headers.get('Origin'));
    const cors: Record<string, string> = origin
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition', Vary: 'Origin' }
      : {};
    const fail = (status: number, message: string) => new Response(message, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: origin ? 204 : 403, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    }
    if (!origin) return fail(403, 'Origem não permitida');
    const { pathname, searchParams } = new URL(request.url);
    if (request.method !== 'GET' || pathname !== '/fetch') return fail(404, 'Não encontrado');

    let target = isAllowedTarget(searchParams.get('url'));
    if (!target) return fail(400, 'URL não permitida');

    // Follow redirects ourselves so every hop is checked against the allowlist.
    let upstream: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstream = await fetch(target.toString(), { redirect: 'manual', headers: { 'User-Agent': 'BookReaderProxy/1.0' } });
      const location = upstream.headers.get('Location');
      if (upstream.status < 300 || upstream.status >= 400 || !location) break;
      target = isAllowedTarget(new URL(location, target).toString());
      if (!target) return fail(400, 'Redirecionamento para host não permitido');
      upstream = null;
    }
    if (!upstream) return fail(508, 'Redirecionamentos demais');
    if (!upstream.ok) return fail(upstream.status, `Falha na origem (${upstream.status})`);
    if (!isPdfResponse(upstream.headers.get('Content-Type'), target)) return fail(415, 'O arquivo não é um PDF');
    const length = Number(upstream.headers.get('Content-Length') ?? 0);
    if (length > MAX_BYTES) return fail(413, 'Arquivo grande demais');

    const headers = new Headers(cors);
    headers.set('Content-Type', 'application/pdf');
    if (length) headers.set('Content-Length', String(length));
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(upstream.body, { status: 200, headers });
  },
};
