import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { DriveRelink, finishLink, isLinked, linkedToken, unlink } from './link';

const PROXY = 'https://proxy.test';

describe('Google Drive linked through the Worker', () => {
  let answer: () => Response;
  let calls: { url: string; auth: string | null }[];

  beforeEach(async () => {
    vi.stubEnv('VITE_PROXY_URL', `${PROXY}/`);
    await db.settings.clear();
    await unlink();
    calls = [];
    answer = () => Response.json({ access_token: `tok-${calls.length}`, expires_in: 3600, email: 'eu@gmail.com' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
        return answer();
      }),
    );
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the device key from the fragment Google sends back to', async () => {
    expect(await finishLink('#/drive-conectado?k=device-key&email=eu%40gmail.com')).toEqual({ email: 'eu@gmail.com' });
    expect(await isLinked()).toBe(true);
    expect(await finishLink('#/drive-conectado?erro=conta')).toEqual({ error: 'Esta conta do Google não pode usar o backup automático' });
    expect(await finishLink('#/drive-conectado?erro=x')).toEqual({ error: 'Não foi possível conectar ao Google Drive' });
  });

  it('gets no token when not linked', async () => {
    expect(await linkedToken()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('asks the Worker with the device key, then reuses the token for the hour', async () => {
    await finishLink('#/drive-conectado?k=device-key&email=eu%40gmail.com');
    expect(await linkedToken()).toBe('tok-1');
    expect(await linkedToken()).toBe('tok-1');
    expect(calls).toEqual([{ url: `${PROXY}/drive/token`, auth: 'Bearer device-key' }]);
  });

  it('forgets the link when the Worker asks to connect again', async () => {
    await finishLink('#/drive-conectado?k=device-key&email=eu%40gmail.com');
    answer = () => Response.json({ error: 'relink' }, { status: 401 });
    await expect(linkedToken()).rejects.toBeInstanceOf(DriveRelink);
    expect(await isLinked()).toBe(false);
    expect(await linkedToken()).toBeNull();
  });

  it('keeps the link through other failures', async () => {
    await finishLink('#/drive-conectado?k=device-key&email=eu%40gmail.com');
    answer = () => Response.json({ error: 'google' }, { status: 502 });
    await expect(linkedToken()).rejects.toThrow('Falha ao renovar');
    expect(await isLinked()).toBe(true);
  });

  it('unlinks in the Worker and here', async () => {
    await finishLink('#/drive-conectado?k=device-key&email=eu%40gmail.com');
    await linkedToken();
    await unlink();
    expect(calls.at(-1)).toEqual({ url: `${PROXY}/drive/unlink`, auth: 'Bearer device-key' });
    expect(await isLinked()).toBe(false);
    expect(await linkedToken()).toBeNull();
  });
});
