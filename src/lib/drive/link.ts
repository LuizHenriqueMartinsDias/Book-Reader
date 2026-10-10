import { db } from '../../db/schema';

/**
 * Lasting Google Drive access through the app's Worker (worker/src/drive.ts): linked once on
 * Google's consent page, then the Worker hands out hour-long tokens with no window, so backups go
 * to Drive by themselves. This device keeps only its device key; Google's refresh token stays in
 * the Worker. Without the Worker (`VITE_PROXY_URL` empty), Drive works through the popup alone.
 */

const LINK_KEY = 'driveLink';
/** The page Google's consent sends back to (see App.tsx). */
export const LINK_ROUTE = '#/drive-conectado';

interface DriveLink {
  key: string;
  email: string;
}

const proxyUrl = () => ((import.meta.env.VITE_PROXY_URL as string | undefined) ?? '').replace(/\/$/, '');
export const linkAvailable = () => !!proxyUrl();

/** The Worker no longer has this device's access (revoked in Google, or expired): connect again. */
export class DriveRelink extends Error {
  constructor() {
    super('Reconecte o Google Drive');
  }
}

let cached: { value: string; expiresAt: number } | null = null;

const stored = async () => (await db.settings.get(LINK_KEY))?.value as DriveLink | undefined;
export const isLinked = async () => !!(await stored());

async function forget() {
  cached = null;
  await db.settings.delete(LINK_KEY);
}

/** Goes to Google's consent page (through the Worker), which comes back to `LINK_ROUTE`. */
export function startLink() {
  const back = `${location.origin}${location.pathname}`;
  location.href = `${proxyUrl()}/auth/start?return=${encodeURIComponent(back)}`;
}

const LINK_ERRORS: Record<string, string> = {
  cancelado: 'Conexão com o Google Drive cancelada',
  conta: 'Esta conta do Google não pode usar o backup automático',
  permissao: 'Faltou permitir o acesso ao Google Drive',
};

/**
 * Back from Google's consent page: keeps the device key from the fragment. The linked account's
 * e-mail, or the reason it didn't link.
 */
export async function finishLink(hash: string): Promise<{ email: string } | { error: string }> {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const key = params.get('k');
  const email = params.get('email');
  if (!key || !email) return { error: LINK_ERRORS[params.get('erro') ?? ''] ?? 'Não foi possível conectar ao Google Drive' };
  cached = null;
  await db.settings.put({ key: LINK_KEY, value: { key, email } satisfies DriveLink });
  return { email };
}

/** A Drive token through the Worker (kept until a minute before it expires), or null when not linked. */
export async function linkedToken(): Promise<string | null> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.value;
  const link = await stored();
  if (!link) return null;
  let res: Response;
  try {
    res = await fetch(`${proxyUrl()}/drive/token`, { method: 'POST', headers: { Authorization: `Bearer ${link.key}` } });
  } catch {
    throw new Error('Sem conexão com o servidor do app');
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (res.status === 401 && body.error === 'relink') {
    await forget();
    throw new DriveRelink();
  }
  if (!res.ok || !body.access_token) throw new Error('Falha ao renovar o acesso ao Google Drive');
  cached = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

/** Drops the cached token (Drive refused it): the next call asks the Worker again. */
export const forgetLinkedToken = () => {
  cached = null;
};

/** Disconnects: the Worker revokes the access in Google and forgets it; this device forgets its key. */
export async function unlink() {
  const link = await stored();
  await forget();
  if (link) await fetch(`${proxyUrl()}/drive/unlink`, { method: 'POST', headers: { Authorization: `Bearer ${link.key}` } }).catch(() => {});
}
