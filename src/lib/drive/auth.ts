/**
 * Signing in to Google Drive from the browser (Google Identity Services token flow). Without a
 * server there's no lasting sign-in: Google gives an access token good for an hour, renewed with
 * a tap (a popup that closes by itself once the app was allowed). The token stays in this tab only.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_KEY = 'book-reader-drive-token';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  callback: (r: TokenResponse) => void;
  error_callback?: (e: { type: string; message?: string }) => void;
  requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
}
interface Oauth2 {
  initTokenClient(o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
const oauth2 = () => (window as unknown as { google?: { accounts?: { oauth2?: Oauth2 } } }).google?.accounts?.oauth2;

/** The OAuth client id set up in Google Cloud (public, not a secret); without it the Drive is hidden. */
const clientId = () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
export const driveAvailable = () => !!clientId();

/** The user closed the Google window, or the browser blocked it: nothing to report as an error. */
export class DriveSignInCancelled extends Error {}

let gis: Promise<Oauth2> | null = null;

/** Loads Google's sign-in script; worth starting early, so a tap's popup isn't blocked by the wait. */
export function loadGoogle(): Promise<Oauth2> {
  const ready = oauth2();
  if (ready) return Promise.resolve(ready);
  gis ??= new Promise<Oauth2>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => (oauth2() ? resolve(oauth2()!) : reject(new Error('Google indisponível')));
    script.onerror = () => {
      gis = null;
      reject(new Error('Sem conexão com o Google'));
    };
    document.head.appendChild(script);
  });
  return gis;
}

function stored(): { value: string; expiresAt: number } | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null');
    return t && t.expiresAt - 60_000 > Date.now() ? t : null;
  } catch {
    return null;
  }
}

/** A token still good for a minute or more, if there is one (no popup). */
export const currentToken = () => stored()?.value ?? null;

export function forgetToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing stored
  }
}

let client: TokenClient | null = null;

/**
 * A Drive access token: the current one, or a new one through Google's popup, which must come
 * from a tap. `account` hints which Google account (once known), so it isn't asked again.
 */
export async function getToken(account?: string | null): Promise<string> {
  const token = currentToken();
  if (token) return token;
  const google = await loadGoogle();
  return new Promise<string>((resolve, reject) => {
    client ??= google.initTokenClient({ client_id: clientId(), scope: DRIVE_SCOPE, callback: () => {} });
    client.callback = (r) => {
      if (!r.access_token) return reject(r.error === 'access_denied' ? new DriveSignInCancelled() : new Error(r.error_description || r.error || 'Falha ao entrar no Google'));
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 }));
      } catch {
        // kept for this call only
      }
      resolve(r.access_token);
    };
    client.error_callback = () => reject(new DriveSignInCancelled());
    client.requestAccessToken({ prompt: account ? '' : 'consent', ...(account && { login_hint: account }) });
  });
}

/** Signs out: Google forgets the app's access (asked again on the next connection). */
export function revokeDrive() {
  const token = currentToken();
  forgetToken();
  if (token) oauth2()?.revoke(token);
}
