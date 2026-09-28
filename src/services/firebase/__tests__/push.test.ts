import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pushes are sent device to device, because Spark has no Cloud Functions and
 * there is nowhere trusted to fan out from. That makes two properties worth
 * pinning: a push must never turn a succeeded action into a failure, and a
 * token that somebody is allowed to read must not become a way to hammer them.
 */

const configured = { value: true };
const stored: Record<string, unknown> = {};
const fetchMock = vi.fn();

vi.mock('../config', () => ({
  isFirebaseConfigured: () => configured.value,
  getDb: () => ({}),
  getFirebaseApp: () => ({}),
}));
vi.mock('../auth', () => ({
  ensureSignedIn: async () => 'me',
  getAuthUid: () => 'me',
}));
vi.mock('../../telemetry', () => ({ captureError: vi.fn() }));
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  get: async (r: { path: string }) => ({
    exists: () => stored[r.path] !== undefined,
    val: () => stored[r.path],
  }),
  set: async (r: { path: string }, v: unknown) => { stored[r.path] = v; },
  remove: async (r: { path: string }) => { delete stored[r.path]; },
  serverTimestamp: () => 1,
}));

const TOKEN = 'ExponentPushToken[abcdef123456]';

beforeEach(() => {
  vi.resetModules();
  configured.value = true;
  for (const k of Object.keys(stored)) delete stored[k];
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
});

describe('publishPushToken', () => {
  it('stores a well formed Expo token', async () => {
    const { publishPushToken } = await import('../push');
    expect(await publishPushToken(TOKEN)).toBe(true);
    expect(stored['localpoker/pushTokens/me']).toMatchObject({ token: TOKEN });
  });

  it('refuses anything that is not an Expo token', async () => {
    const { publishPushToken } = await import('../push');
    for (const bad of ['', 'nope', 'FCM[x]', 'ExponentPushToken']) {
      expect(await publishPushToken(bad)).toBe(false);
    }
    expect(stored['localpoker/pushTokens/me']).toBeUndefined();
  });
});

describe('clearPushToken', () => {
  it('removes the capability rather than just ignoring it', async () => {
    const { publishPushToken, clearPushToken } = await import('../push');
    await publishPushToken(TOKEN);
    await clearPushToken();
    expect(stored['localpoker/pushTokens/me']).toBeUndefined();
  });
});

describe('sendPush', () => {
  it('posts to Expo when the recipient has a token', async () => {
    const { sendPush } = await import('../push');
    stored['localpoker/pushTokens/alice'] = { token: TOKEN, updatedAt: 1 };

    expect(await sendPush('alice', 'friend-request', 'bob')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe(TOKEN);
    expect(body.title).toMatch(/friend request/i);
    expect(body.body).toContain('bob');
  });

  it('carries the room code so a tap can open the right table', async () => {
    const { sendPush } = await import('../push');
    stored['localpoker/pushTokens/alice'] = { token: TOKEN, updatedAt: 1 };

    await sendPush('alice', 'room-invite', 'bob', 'AB24');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body).toContain('AB24');
    expect(body.data).toMatchObject({ kind: 'room-invite', code: 'AB24' });
  });

  it('does nothing when the recipient never enabled notifications', async () => {
    const { sendPush } = await import('../push');
    expect(await sendPush('alice', 'friend-request', 'bob')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate limits repeat sends to the same person for the same reason', async () => {
    const { sendPush } = await import('../push');
    stored['localpoker/pushTokens/alice'] = { token: TOKEN, updatedAt: 1 };

    expect(await sendPush('alice', 'friend-request', 'bob')).toBe(true);
    expect(await sendPush('alice', 'friend-request', 'bob')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let one recipient block another', async () => {
    const { sendPush } = await import('../push');
    stored['localpoker/pushTokens/alice'] = { token: TOKEN, updatedAt: 1 };
    stored['localpoker/pushTokens/carol'] = { token: TOKEN, updatedAt: 1 };

    await sendPush('alice', 'friend-request', 'bob');
    expect(await sendPush('carol', 'friend-request', 'bob')).toBe(true);
  });

  it('reports failure instead of throwing when the network is down', async () => {
    const { sendPush } = await import('../push');
    stored['localpoker/pushTokens/alice'] = { token: TOKEN, updatedAt: 1 };
    fetchMock.mockRejectedValue(new Error('offline'));

    // The caller's real work already succeeded, so this must stay quiet.
    await expect(sendPush('alice', 'friend-request', 'bob')).resolves.toBe(false);
  });

  it('ignores a stored value that is not a usable token', async () => {
    const { sendPush } = await import('../push');
    stored['localpoker/pushTokens/alice'] = { token: 'garbage', updatedAt: 1 };
    expect(await sendPush('alice', 'friend-request', 'bob')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays inert when Firebase is unconfigured', async () => {
    configured.value = false;
    const { sendPush } = await import('../push');
    expect(await sendPush('alice', 'friend-request', 'bob')).toBe(false);
  });
});
