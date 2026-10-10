import { allowedOrigin } from './validate';

/**
 * Lasting Google Drive access for the app's automatic backups. The browser alone only gets an
 * hour-long token, renewed with a tap; here the Worker keeps Google's refresh token (encrypted, in
 * KV) and hands the device that linked it fresh hour-long tokens, for the `drive.file` scope only.
 *
 * GET  /auth/start?return=<app url>  → Google's consent page
 * GET  /auth/callback                → back to <app url>#/drive-conectado?k=<device key>&email=…
 * POST /drive/token  (Bearer <device key>) → { access_token, expires_in, email } or 401 { error: 'relink' }
 * POST /drive/unlink (Bearer <device key>) → revoked and forgotten
 *
 * The refresh token never leaves the Worker; the device key is known here only by its hash.
 */

/** The few methods used of Cloudflare's KVNamespace. */
export interface Kv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DriveEnv {
  DRIVE_LINKS?: Kv;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** AES-256 key (base64) that encrypts the refresh tokens kept in KV. */
  TOKEN_KEY?: string;
  /** Google accounts allowed to link, comma-separated (the owner's): nobody else gets a Drive service out of this Worker. */
  ALLOWED_EMAILS?: string;
}

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Seconds the app has to come back from Google's consent page. */
const STATE_TTL = 600;

type Cors = Record<string, string>;
interface Link {
  email: string;
  /** The refresh token, encrypted. */
  refresh: string;
  createdAt: number;
}
interface TokenAnswer {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
}

const text = (status: number, message: string, headers: Cors = {}) =>
  new Response(message, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const json = (status: number, body: unknown, headers: Cors) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const randomKey = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async (s: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

const aesKey = (secret: string) => crypto.subtle.importKey('raw', fromBase64(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** AES-GCM, bound to `context` (the link's id), so a sealed token can't be moved to another link. */
export async function seal(secret: string, plain: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, await aesKey(secret), new TextEncoder().encode(plain));
  return `${base64url(iv)}.${base64url(new Uint8Array(data))}`;
}

export async function unseal(secret: string, sealed: string, context: string) {
  const [iv, data] = sealed.split('.').map(fromBase64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, await aesKey(secret), data);
  return new TextDecoder().decode(plain);
}

/** Where to send the user back: a page of the app (by its allowed origins), without query or fragment. */
export function appReturn(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || !allowedOrigin(url.origin)) return null;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/**
 * The account's e-mail from the ID token. Its signature isn't checked: the token came straight
 * from Google's token endpoint over HTTPS, in answer to this Worker's own request.
 */
function idTokenEmail(idToken: string | undefined, clientId: string): string | null {
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64(idToken!.split('.')[1]))) as { email?: string; email_verified?: boolean; aud?: string };
    return claims.aud === clientId && claims.email_verified && claims.email ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

const allowedEmails = (env: DriveEnv) => (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const revoke = (token: string | undefined) =>
  token ? fetch(REVOKE_URL, { method: 'POST', body: new URLSearchParams({ token }) }).then(() => {}, () => {}) : Promise.resolve();

const configured = (env: DriveEnv): env is Required<DriveEnv> => !!(env.DRIVE_LINKS && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_KEY && env.ALLOWED_EMAILS);

const callbackUrl = (request: Request) => `${new URL(request.url).origin}/auth/callback`;

/** /auth/start and /auth/callback: page navigations (no Origin header), so the checks are on `return` and `state`. */
export async function handleAuth(request: Request, env: DriveEnv): Promise<Response> {
  if (!configured(env)) return text(503, 'Backup automático não configurado');
  const url = new URL(request.url);
  const kv = env.DRIVE_LINKS;

  if (request.method === 'GET' && url.pathname === '/auth/start') {
    const back = appReturn(url.searchParams.get('return'));
    if (!back) return text(400, 'Endereço de volta não permitido');
    const state = randomKey();
    await kv.put(`state:${state}`, JSON.stringify({ return: back }), { expirationTtl: STATE_TTL });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl(request),
      response_type: 'code',
      scope: `openid email ${DRIVE_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return Response.redirect(`${AUTH_URL}?${params}`, 302);
  }

  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state');
    const saved = state && (await kv.get(`state:${state}`));
    if (!saved) return text(400, 'Este link expirou. Conecte de novo pelo app.');
    await kv.delete(`state:${state}`);
    const back = (JSON.parse(saved) as { return: string }).return;
    // In the fragment: it reaches no server (nor its logs), and the app takes it out of the history.
    const done = (params: Record<string, string>) => Response.redirect(`${back}#/drive-conectado?${new URLSearchParams(params)}`, 302);

    const code = url.searchParams.get('code');
    if (!code) return done({ erro: 'cancelado' });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUrl(request), grant_type: 'authorization_code' }),
    });
    const answer = (await res.json().catch(() => ({}))) as TokenAnswer;
    if (!res.ok || !answer.access_token) return done({ erro: 'google' });

    const email = idTokenEmail(answer.id_token, env.GOOGLE_CLIENT_ID);
    const problem = !email || !allowedEmails(env).includes(email) ? 'conta' : !(answer.scope ?? '').split(' ').includes(DRIVE_SCOPE) ? 'permissao' : !answer.refresh_token ? 'google' : null;
    if (problem) {
      await revoke(answer.refresh_token ?? answer.access_token);
      return done({ erro: problem });
    }

    const deviceKey = randomKey();
    const id = await sha256(deviceKey);
    const link: Link = { email: email!, refresh: await seal(env.TOKEN_KEY, answer.refresh_token!, id), createdAt: Date.now() };
    await kv.put(`link:${id}`, JSON.stringify(link));
    return done({ k: deviceKey, email: email! });
  }

  return text(404, 'Não encontrado');
}

/** The link of the device key in the Authorization header, with the refresh token decrypted. */
async function linkOf(request: Request, env: Required<DriveEnv>) {
  const key = request.headers.get('Authorization')?.match(/^Bearer ([\w-]{20,100})$/)?.[1];
  if (!key) return null;
  const id = await sha256(key);
  const saved = await env.DRIVE_LINKS.get(`link:${id}`);
  if (!saved) return null;
  const link = JSON.parse(saved) as Link;
  const refresh = await unseal(env.TOKEN_KEY, link.refresh, id).catch(() => null);
  return { id, link, refresh };
}

/** /drive/token and /drive/unlink, called by the app (its origin already checked). */
export async function handleDriveApi(request: Request, env: DriveEnv, cors: Cors): Promise<Response> {
  if (!configured(env)) return text(503, 'Backup automático não configurado', cors);
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST' || (pathname !== '/drive/token' && pathname !== '/drive/unlink')) return text(404, 'Não encontrado', cors);
  const found = await linkOf(request, env);

  if (pathname === '/drive/unlink') {
    if (found) {
      await revoke(found.refresh ?? undefined);
      await env.DRIVE_LINKS.delete(`link:${found.id}`);
    }
    return new Response(null, { status: 204, headers: cors });
  }

  if (!found) return json(401, { error: 'relink' }, cors);
  const relink = async () => {
    await env.DRIVE_LINKS.delete(`link:${found.id}`);
    return json(401, { error: 'relink' }, cors);
  };
  // Encrypted with another TOKEN_KEY: of no use any more.
  if (!found.refresh) return relink();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: found.refresh, grant_type: 'refresh_token' }),
  });
  const answer = (await res.json().catch(() => ({}))) as TokenAnswer;
  // Revoked by the user, or expired: the app must link again.
  if (answer.error === 'invalid_grant') return relink();
  if (!res.ok || !answer.access_token) return json(502, { error: 'google' }, cors);
  return json(200, { access_token: answer.access_token, expires_in: answer.expires_in ?? 3600, email: found.link.email }, cors);
}
