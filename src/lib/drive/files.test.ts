import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { backupNow, backupFileName } from '../backupTargets';
import { forgetToken } from './auth';
import { downloadBackup, driveEmail, forgetDriveFolder, listBackups, uploadBackup } from './files';

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: string;
  modifiedTime: string;
  trashed?: boolean;
}

/** Enough of the Drive API (v3) for the app, keeping files in memory. */
function fakeDrive({ exposeLocation = true } = {}) {
  const files = new Map<string, FakeFile>();
  const sessions = new Map<string, { id?: string; meta: Partial<FakeFile> }>();
  const calls: string[] = [];
  let next = 1;
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++clock * 1000).toISOString();
  const put = (meta: Partial<FakeFile>, content: string, id?: string) => {
    const f = id ? files.get(id)! : { id: `f${next++}`, name: '', mimeType: '', parents: [], content: '' };
    Object.assign(f, meta, { content, modifiedTime: stamp() });
    files.set(f.id, f as FakeFile);
  };
  const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });

  const handler = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url.pathname}${url.searchParams.get('uploadType') ? `?${url.searchParams.get('uploadType')}` : ''}`);
    if (new Headers(init.headers).get('Authorization') !== 'Bearer tok') return new Response('{"error":{"message":"bad"}}', { status: 401 });
    const body = init.body instanceof Blob ? await init.body.text() : (init.body as string | undefined);
    const path = url.pathname;

    if (path === '/drive/v3/about') return ok({ user: { emailAddress: 'eu@gmail.com' } });
    if (path === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q')!;
      const name = q.match(/name='([^']+)'/)?.[1];
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const folder = q.includes("mimeType='application/vnd.google-apps.folder'");
      let found = [...files.values()].filter((f) => !f.trashed && (!name || f.name === name) && (!parent || f.parents.includes(parent)) && (!folder || f.mimeType.endsWith('folder')));
      if (url.searchParams.get('orderBy') === 'name desc') found = found.sort((a, b) => b.name.localeCompare(a.name));
      return ok({ files: found.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: String(f.content.length) })) });
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      put(JSON.parse(body!), '');
      return ok({ id: `f${next - 1}` });
    }
    const one = path.match(/^\/drive\/v3\/files\/([^/]+)$/)?.[1];
    if (one) {
      const f = files.get(one);
      if (!f) return new Response('{"error":{"message":"File not found"}}', { status: 404 });
      if (method === 'DELETE') return files.delete(one), new Response(null, { status: 204 });
      if (url.searchParams.get('alt') === 'media') return new Response(f.content);
      return ok({ trashed: !!f.trashed });
    }
    const upload = path.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (upload && url.searchParams.get('uploadType') === 'resumable') {
      const session = `https://www.googleapis.com/upload/session/${next++}`;
      sessions.set(session, { id: upload[1], meta: JSON.parse(body!) });
      return ok({}, exposeLocation ? { Location: session } : {});
    }
    if (upload && url.searchParams.get('uploadType') === 'multipart') {
      const boundary = new Headers(init.headers).get('Content-Type')!.split('boundary=')[1];
      const [meta, content] = body!
        .split(`--${boundary}`)
        .slice(1, -1)
        .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4, -2));
      put(upload[1] ? {} : JSON.parse(meta), content, upload[1]);
      return ok({});
    }
    const session = sessions.get(url.href);
    if (session && method === 'PUT') {
      put(session.meta, body!, session.id);
      return ok({});
    }
    return new Response('not faked', { status: 500 });
  };
  return { files, calls, handler };
}

const name = (day: number) => `book-reader-backup-2026-10-${String(day).padStart(2, '0')}.json`;
const backup = (text: string) => new Blob([text], { type: 'application/json' });

describe('Google Drive backups', () => {
  let drive: ReturnType<typeof fakeDrive>;
  const use = (d: ReturnType<typeof fakeDrive>) => {
    drive = d;
    vi.stubGlobal('fetch', vi.fn(d.handler));
  };

  beforeEach(async () => {
    await db.settings.clear();
    await forgetDriveFolder();
    use(fakeDrive());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates the "Book Reader" folder once and uploads into it (resumable)', async () => {
    await uploadBackup('tok', backup('{"a":1}'), name(1));
    await uploadBackup('tok', backup('{"a":2}'), name(2));
    const folders = [...drive.files.values()].filter((f) => f.mimeType.endsWith('folder'));
    expect(folders.map((f) => f.name)).toEqual(['Book Reader']);
    const saved = [...drive.files.values()].filter((f) => f.parents.includes(folders[0].id));
    expect(saved.map((f) => [f.name, f.content])).toEqual([
      [name(1), '{"a":1}'],
      [name(2), '{"a":2}'],
    ]);
    expect(drive.calls.filter((c) => c.includes('resumable'))).toHaveLength(2);
  });

  it("replaces the same day's backup instead of adding another", async () => {
    await uploadBackup('tok', backup('old'), name(5));
    await uploadBackup('tok', backup('new'), name(5));
    const backups = [...drive.files.values()].filter((f) => f.name === name(5));
    expect(backups.map((f) => f.content)).toEqual(['new']);
    expect(drive.calls).toContain(`PATCH /upload/drive/v3/files/${backups[0].id}?resumable`);
  });

  it('keeps the 10 newest backups', async () => {
    for (let day = 1; day <= 12; day++) await uploadBackup('tok', backup(String(day)), name(day));
    expect((await listBackups('tok')).map((b) => b.name)).toEqual(Array.from({ length: 10 }, (_, i) => name(12 - i)));
  });

  it('lists the backups, newest first, and downloads one', async () => {
    await uploadBackup('tok', backup('{"x":1}'), name(3));
    await uploadBackup('tok', backup('{"x":22}'), name(4));
    const list = await listBackups('tok');
    expect(list.map((b) => [b.name, b.size])).toEqual([
      [name(4), 8],
      [name(3), 7],
    ]);
    expect(await (await downloadBackup('tok', list[1].id)).text()).toBe('{"x":1}');
  });

  it('makes a new folder when the remembered one was deleted in Drive', async () => {
    await uploadBackup('tok', backup('1'), name(1));
    const first = [...drive.files.values()].find((f) => f.mimeType.endsWith('folder'))!;
    first.trashed = true;
    await forgetDriveFolder().then(() => db.settings.put({ key: 'driveFolder', value: first.id }));
    await uploadBackup('tok', backup('2'), name(2));
    const live = [...drive.files.values()].filter((f) => f.mimeType.endsWith('folder') && !f.trashed);
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(first.id);
  });

  it('sends in one request when the browser cannot read the upload address', async () => {
    use(fakeDrive({ exposeLocation: false }));
    await uploadBackup('tok', backup('{"m":1}'), name(7));
    expect([...drive.files.values()].find((f) => f.name === name(7))?.content).toBe('{"m":1}');
    expect(drive.calls.some((c) => c.endsWith('?multipart'))).toBe(true);
  });

  it('tells an expired sign-in apart, and says which account is connected', async () => {
    await expect(listBackups('old')).rejects.toMatchObject({ status: 401, message: 'O acesso ao Google Drive expirou' });
    expect(await driveEmail('tok')).toBe('eu@gmail.com');
  });
});

describe('backing up with Google Drive connected', () => {
  const google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {}, callback: (_: unknown) => {} }), revoke() {} } } };
  let drive: ReturnType<typeof fakeDrive>;

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await forgetDriveFolder();
    await db.notes.put({ id: 'n', bookId: 'b', page: 1, body: 'x', createdAt: 0, updatedAt: 0 });
    drive = fakeDrive();
    vi.stubGlobal('fetch', vi.fn(drive.handler));
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          ...google.accounts.oauth2,
          initTokenClient: () => {
            const client = { callback: (_: unknown) => {}, requestAccessToken: () => setTimeout(() => client.callback({ access_token: 'tok', expires_in: 3600 })) };
            return client;
          },
        },
      },
    });
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    forgetToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the backup straight to Drive', async () => {
    expect(await backupNow({ drive: 'eu@gmail.com' })).toEqual({ via: 'drive' });
    const file = [...drive.files.values()].find((f) => f.name === backupFileName())!;
    expect(JSON.parse(file.content).notes).toHaveLength(1);
  });

  it('uses the other ways when Drive is not connected or not set up', async () => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await backupNow({ drive: null })).toEqual({ via: 'download' });
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(await backupNow({ drive: 'eu@gmail.com' })).toEqual({ via: 'download' });
    expect(drive.calls).toEqual([]);
    vi.restoreAllMocks();
  });
});
