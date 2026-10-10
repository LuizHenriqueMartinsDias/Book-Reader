// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_URL, DRIVE_SCOPE, REVOKE_URL, seal, TOKEN_URL, unseal, type Kv } from './drive';
import worker from './index';

const APP = 'https://luizhenriquemartinsdias.github.io';
const WORKER = 'https://book-proxy.test';
const REFRESH = 'refresh-secret-123';

/** Workers KV in memory, with expiration. */
class FakeKv implements Kv {
  data = new Map<string, { value: string; until: number }>();
  async get(key: string) {
    const e = this.data.get(key);
    return e && e.until > Date.now() ? e.value : null;
  }
  async put(key: string, value: string, o?: { expirationTtl?: number }) {
    this.data.set(key, { value, until: o?.expirationTtl ? Date.now() + o.expirationTtl * 1000 : Infinity });
  }
  async delete(key: string) {
    this.data.delete(key);
  }
}

const idToken = (claims: object) => `x.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.sig`;
/** A 32-byte AES key in base64, every byte `n`. */
const keyOf = (n: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(n)));

/** Google's token and revoke endpoints. */
function fakeGoogle() {
  const g = {
    email: 'dono@gmail.com',
    scope: `openid ${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    revoked: new Set<string>(),
    refreshed: 0,
    handler: async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const body = new URLSearchParams(init.body as URLSearchParams);
      if (url === REVOKE_URL) {
        g.revoked.add(body.get('token')!);
        return new Response('{}');
      }
      if (url !== TOKEN_URL) return new Response('not faked', { status: 500 });
      expect(body.get('client_secret')).toBe('secret');
      if (body.get('grant_type') === 'authorization_code') {
        if (body.get('code') !== 'good-code' || body.get('redirect_uri') !== `${WORKER}/auth/callback`) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        return Response.json({
          access_token: 'first-access',
          expires_in: 3599,
          refresh_token: REFRESH,
          scope: g.scope,
          id_token: idToken({ aud: 'client-id', email: g.email, email_verified: true }),
        });
      }
      if (body.get('grant_type') === 'refresh_token') {
        if (g.revoked.has(body.get('refresh_token')!) || body.get('refresh_token') !== REFRESH) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        return Response.json({ access_token: `access-${++g.refreshed}`, expires_in: 3599 });
      }
      return new Response('bad grant', { status: 400 });
    },
  };
  return g;
}

describe('lasting Google Drive access', () => {
  let kv: FakeKv;
  let google: ReturnType<typeof fakeGoogle>;
  let responses: string[];
  const env = () => ({
    DRIVE_LINKS: kv,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'secret',
    TOKEN_KEY: keyOf(7),
    ALLOWED_EMAILS: 'Dono@gmail.com, outro@gmail.com',
  });

  /** A request to the Worker; every answer is kept, to check the refresh token never shows up. */
  async function call(path: string, init: RequestInit & { origin?: string | null } = {}) {
    const headers = new Headers(init.headers);
    if (init.origin !== null) headers.set('Origin', init.origin ?? APP);
    const res = await worker.fetch(new Request(`${WORKER}${path}`, { ...init, headers }), env());
    responses.push(`${res.headers.get('Location') ?? ''} ${await res.clone().text()}`);
    return res;
  }
  const nav = (path: string) => call(path, { origin: null });

  /** Goes through the consent page and back; the fragment the app receives. */
  async function link(code = 'good-code') {
    const start = await nav(`/auth/start?return=${encodeURIComponent(`${APP}/Book-Reader/?x=1#/old`)}`);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
    const back = await nav(`/auth/callback?code=${code}&state=${state}`);
    const location = back.headers.get('Location')!;
    expect(location.startsWith(`${APP}/Book-Reader/#/drive-conectado?`)).toBe(true);
    return new URLSearchParams(location.split('?')[1]);
  }
  const token = (key: string, origin?: string) => call('/drive/token', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, origin });

  beforeEach(() => {
    kv = new FakeKv();
    google = fakeGoogle();
    responses = [];
    vi.stubGlobal('fetch', vi.fn(google.handler));
  });
  afterEach(() => {
    expect(responses.join('\n')).not.toContain(REFRESH);
    vi.unstubAllGlobals();
  });

  it("sends to Google's consent page asking for offline Drive access", async () => {
    const res = await nav(`/auth/start?return=${encodeURIComponent(`${APP}/Book-Reader/`)}`);
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('Location')!);
    expect(`${to.origin}${to.pathname}`).toBe(AUTH_URL);
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      client_id: 'client-id',
      redirect_uri: `${WORKER}/auth/callback`,
      response_type: 'code',
      scope: `openid email ${DRIVE_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
    });
    expect(await kv.get(`state:${to.searchParams.get('state')}`)).toContain('/Book-Reader/');
  });

  it('only sends back to the app', async () => {
    for (const ret of ['https://evil.example/', 'https://luizhenriquemartinsdias.github.io.evil.example/', 'javascript:alert(1)', '']) {
      expect((await nav(`/auth/start?return=${encodeURIComponent(ret)}`)).status).toBe(400);
    }
    expect(kv.data.size).toBe(0);
  });

  it('refuses unknown or reused states', async () => {
    expect((await nav('/auth/callback?code=good-code&state=made-up')).status).toBe(400);
    const start = await nav(`/auth/start?return=${encodeURIComponent(APP)}`);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
    expect((await nav(`/auth/callback?code=good-code&state=${state}`)).status).toBe(302);
    expect((await nav(`/auth/callback?code=good-code&state=${state}`)).status).toBe(400);
  });

  it('links the device, then hands it fresh tokens', async () => {
    const back = await link();
    const key = back.get('k')!;
    expect(back.get('email')).toBe('dono@gmail.com');
    expect(key).toMatch(/^[\w-]{43}$/);

    const stored = [...kv.data.entries()].filter(([k]) => k.startsWith('link:'));
    expect(stored).toHaveLength(1);
    expect(stored[0][0]).not.toContain(key);
    expect(stored[0][1].value).not.toContain(REFRESH);

    const res = await token(key);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(await res.json()).toEqual({ access_token: 'access-1', expires_in: 3599, email: 'dono@gmail.com' });
    expect(await (await token(key)).json()).toMatchObject({ access_token: 'access-2' });
  });

  it('turns away other accounts, and revokes what Google gave them', async () => {
    google.email = 'estranho@gmail.com';
    const back = await link();
    expect(Object.fromEntries(back)).toEqual({ erro: 'conta' });
    expect(google.revoked.has(REFRESH)).toBe(true);
    expect([...kv.data.keys()].some((k) => k.startsWith('link:'))).toBe(false);
  });

  it('turns away a consent without Drive access', async () => {
    google.scope = 'openid email';
    expect(Object.fromEntries(await link())).toEqual({ erro: 'permissao' });
    expect(google.revoked.has(REFRESH)).toBe(true);
  });

  it('goes back to the app when the user cancels', async () => {
    const start = await nav(`/auth/start?return=${encodeURIComponent(APP)}`);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
    const back = await nav(`/auth/callback?error=access_denied&state=${state}`);
    expect(back.headers.get('Location')).toBe(`${APP}/#/drive-conectado?erro=cancelado`);
  });

  it('asks to link again once Google revoked the access, forgetting the link', async () => {
    const key = (await link()).get('k')!;
    google.revoked.add(REFRESH);
    const res = await token(key);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'relink' });
    expect([...kv.data.keys()].some((k) => k.startsWith('link:'))).toBe(false);
  });

  it('answers only the app, and only with a known device key', async () => {
    const key = (await link()).get('k')!;
    expect((await token(key, 'https://evil.example')).status).toBe(403);
    expect((await call('/drive/token', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, origin: null })).status).toBe(403);
    expect(await (await token('x'.repeat(43))).json()).toEqual({ error: 'relink' });
    expect((await call('/drive/token', { method: 'POST' })).status).toBe(401);
    expect(google.refreshed).toBe(0);
  });

  it('unlinks: revoked at Google and forgotten', async () => {
    const key = (await link()).get('k')!;
    const res = await call('/drive/unlink', { method: 'POST', headers: { Authorization: `Bearer ${key}` } });
    expect(res.status).toBe(204);
    expect(google.revoked.has(REFRESH)).toBe(true);
    expect((await token(key)).status).toBe(401);
  });

  it('allows the app to send the device key from the browser', async () => {
    const res = await call('/drive/token', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization');
  });

  it('stays off until configured', async () => {
    const res = await worker.fetch(new Request(`${WORKER}/auth/start?return=${encodeURIComponent(APP)}`), {});
    expect(res.status).toBe(503);
  });
});

describe('refresh token encryption', () => {
  const secret = keyOf(1);

  it('opens what it sealed, only with the same key and link', async () => {
    const sealed = await seal(secret, 'token', 'link-a');
    expect(sealed).not.toContain('token');
    expect(await unseal(secret, sealed, 'link-a')).toBe('token');
    await expect(unseal(secret, sealed, 'link-b')).rejects.toThrow();
    await expect(unseal(keyOf(2), sealed, 'link-a')).rejects.toThrow();
    expect(await seal(secret, 'token', 'link-a')).not.toBe(sealed);
  });
});
