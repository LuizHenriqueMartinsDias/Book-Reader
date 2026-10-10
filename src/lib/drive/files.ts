import { db } from '../../db/schema';
import { BACKUP_NAME, backupsToRemove } from '../backupTargets';

/**
 * Backups in a "Book Reader" folder of the user's Google Drive. With the `drive.file` scope the
 * app sees only what it created itself, and the user sees the folder in Drive like any other.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Book Reader';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDER_KEY = 'driveFolder';
/** Largest file a single "multipart" upload takes; bigger ones need a resumable upload. */
const MULTIPART_MAX = 5 * 1024 * 1024;

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface DriveBackup {
  id: string;
  name: string;
  modifiedTime: string;
  /** Bytes. */
  size: number;
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError('Sem conexão com o Google Drive', 0);
  }
  if (res.ok) return res;
  const detail = await res
    .json()
    .then((j: { error?: { message?: string } }) => j.error?.message)
    .catch(() => undefined);
  throw new DriveError(
    res.status === 401 ? 'O acesso ao Google Drive expirou' : res.status === 403 && /quota|storage/i.test(detail ?? '') ? 'O Google Drive está sem espaço' : (detail ?? `Erro do Google Drive (${res.status})`),
    res.status,
  );
}

const json = <T,>(token: string, url: string, init?: RequestInit) => call(token, url, init).then((r) => r.json() as Promise<T>);

async function find(token: string, q: string, fields = 'files(id,name)', orderBy?: string) {
  const params = new URLSearchParams({ q, fields, spaces: 'drive', pageSize: '100', ...(orderBy && { orderBy }) });
  return (await json<{ files: (DriveBackup & { createdTime?: string })[] }>(token, `${API}/files?${params}`)).files;
}

/** The remembered folder, once seen to still exist in this session. */
let checked: string | null = null;

/** The backup folder: remembered (if it wasn't deleted in Drive), found, or created. */
async function folder(token: string): Promise<string> {
  const known = (await db.settings.get(FOLDER_KEY))?.value as string | undefined;
  if (known && known === checked) return known;
  if (known) {
    const alive = await json<{ trashed?: boolean }>(token, `${API}/files/${known}?fields=trashed`).then(
      (f) => !f.trashed,
      (e) => {
        if (e instanceof DriveError && e.status === 404) return false;
        throw e;
      },
    );
    if (alive) return (checked = known);
  }
  const [existing] = await find(token, `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const id =
    existing?.id ??
    (
      await json<{ id: string }>(token, `${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      })
    ).id;
  await db.settings.put({ key: FOLDER_KEY, value: id });
  return (checked = id);
}

/** Forgets the remembered folder (signing out: another account may come next). */
export async function forgetDriveFolder() {
  checked = null;
  await db.settings.delete(FOLDER_KEY);
}

/** Sends a file's content: resumable (any size), or in one request if the browser can't read where to send it. */
async function send(token: string, blob: Blob, metadata: object, fileId?: string) {
  const target = fileId ? `${UPLOAD}/files/${fileId}` : `${UPLOAD}/files`;
  const start = await call(token, `${target}?uploadType=resumable`, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  const session = start.headers.get('Location');
  if (session) {
    await call(token, session, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: blob });
    return;
  }
  if (blob.size > MULTIPART_MAX) throw new DriveError('O backup é grande demais para enviar ao Google Drive por este navegador', 0);
  const boundary = `book-reader-${Date.now()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  await call(token, `${target}?uploadType=multipart`, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
}

/**
 * Saves a backup into the Drive folder: today's file is replaced (one per day, like the backup
 * folder on computers), and only the 10 newest are kept.
 */
export async function uploadBackup(token: string, blob: Blob, name: string) {
  const parent = await folder(token);
  const same = await find(token, `name='${name}' and '${parent}' in parents and trashed=false`);
  if (same[0]) await send(token, blob, {}, same[0].id);
  else await send(token, blob, { name, parents: [parent], mimeType: 'application/json' });

  const all = await find(token, `'${parent}' in parents and trashed=false`);
  const old = new Set(backupsToRemove(all.map((f) => f.name)));
  for (const f of all) if (old.has(f.name)) await call(token, `${API}/files/${f.id}`, { method: 'DELETE' }).catch(() => {});
}

/** The backups in the Drive folder, newest first. */
export async function listBackups(token: string): Promise<DriveBackup[]> {
  const files = await find(token, `'${await folder(token)}' in parents and trashed=false`, 'files(id,name,modifiedTime,size)', 'name desc');
  return files.filter((f) => BACKUP_NAME.test(f.name)).map((f) => ({ ...f, size: Number(f.size) || 0 }));
}

export const downloadBackup = (token: string, id: string) => call(token, `${API}/files/${id}?alt=media`).then((r) => r.blob());

/** E-mail of the Google account the token belongs to, to show which Drive is connected. */
export const driveEmail = (token: string) => json<{ user: { emailAddress: string } }>(token, `${API}/about?fields=user(emailAddress)`).then((r) => r.user.emailAddress);
