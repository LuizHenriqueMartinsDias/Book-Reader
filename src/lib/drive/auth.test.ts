import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToken, driveAvailable, DriveSignInCancelled, forgetToken, getToken } from './auth';

/** Google Identity Services as the app uses it: a token client answering through its callback. */
const google = {
  answer: (() => ({ access_token: 'tok', expires_in: 3600 })) as () => { access_token?: string; error?: string } | 'closed',
  requests: [] as { prompt?: string; login_hint?: string }[],
  accounts: {
    oauth2: {
      initTokenClient: () => {
        const client = {
          callback: (_: unknown) => {},
          error_callback: (_: unknown) => {},
          requestAccessToken: (o: { prompt?: string; login_hint?: string }) => {
            google.requests.push(o);
            const a = google.answer();
            setTimeout(() => (a === 'closed' ? client.error_callback({ type: 'popup_closed' }) : client.callback(a)));
          },
        };
        return client;
      },
      revoke: () => {},
    },
  },
};

describe('signing in to Google Drive', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    vi.stubGlobal('google', google);
    forgetToken();
    google.requests = [];
    google.answer = () => ({ access_token: 'tok', expires_in: 3600 });
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is hidden without a client id', () => {
    expect(driveAvailable()).toBe(true);
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(driveAvailable()).toBe(false);
  });

  it('asks for consent the first time, then reuses the token for the hour', async () => {
    expect(await getToken(null)).toBe('tok');
    expect(await getToken(null)).toBe('tok');
    expect(google.requests).toEqual([{ prompt: 'consent' }]);
    expect(currentToken()).toBe('tok');
  });

  it('signs in again without asking for consent once the account is known', async () => {
    await getToken('eu@gmail.com');
    expect(google.requests).toEqual([{ prompt: '', login_hint: 'eu@gmail.com' }]);
  });

  it('treats a closed window or a refusal as cancelled, not as an error', async () => {
    google.answer = () => 'closed';
    await expect(getToken(null)).rejects.toBeInstanceOf(DriveSignInCancelled);
    google.answer = () => ({ error: 'access_denied' });
    await expect(getToken(null)).rejects.toBeInstanceOf(DriveSignInCancelled);
    expect(currentToken()).toBeNull();
  });
});
