import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Friends used to be permanently gray and permanently wearing a Pal derived
 * from their handle: `friendFromEdge` hardcoded `online: false`, and the
 * avatar came from `palFromSeed(handle)` rather than anything they had chosen.
 *
 * Both are fixed by reading a friend's *own* records rather than the edge we
 * hold, because an edge is a snapshot from when the friendship was made and a
 * friend cannot reach into our copy to update it. These tests pin that.
 */

const configured = { value: true };
const listeners: Record<string, ((snap: { val: () => unknown }) => void)[]> = {};
const errorHandlers: Record<string, ((e: Error) => void)[]> = {};

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
  onValue: (
    r: { path: string },
    cb: (snap: { val: () => unknown }) => void,
    onErr?: (e: Error) => void,
  ) => {
    (listeners[r.path] ??= []).push(cb);
    if (onErr) (errorHandlers[r.path] ??= []).push(onErr);
    return () => {
      listeners[r.path] = (listeners[r.path] ?? []).filter((f) => f !== cb);
    };
  },
  onDisconnect: () => ({ set: async () => {} }),
  set: async () => {},
  serverTimestamp: () => 0,
}));

const emit = (path: string, value: unknown) => {
  for (const cb of listeners[path] ?? []) cb({ val: () => value });
};
const fail = (path: string, message: string) => {
  for (const cb of errorHandlers[path] ?? []) cb(new Error(message));
};

beforeEach(() => {
  configured.value = true;
  for (const k of Object.keys(listeners)) delete listeners[k];
  for (const k of Object.keys(errorHandlers)) delete errorHandlers[k];
});

describe('subscribeFriendLive', () => {
  it('reports a friend online only when their own presence says so', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const seen: Record<string, unknown>[] = [];
    subscribeFriendLive(['alice'], (live) => seen.push(live));

    emit('localpoker/presence/alice', { online: true, lastSeen: 1 });
    expect(seen.at(-1)?.alice).toMatchObject({ online: true });

    emit('localpoker/presence/alice', { online: false, lastSeen: 2 });
    expect(seen.at(-1)?.alice).toMatchObject({ online: false });
  });

  it('treats a missing presence record as offline rather than unknown', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const seen: Record<string, unknown>[] = [];
    subscribeFriendLive(['alice'], (live) => seen.push(live));

    emit('localpoker/presence/alice', null);
    expect(seen.at(-1)?.alice).toMatchObject({ online: false });
  });

  it('surfaces the friend current Pal and name from their own directory entry', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const seen: Record<string, { palJson?: string; displayName?: string }>[] = [];
    subscribeFriendLive(['alice'], (live) => seen.push(live as never));

    emit('localpoker/users/alice', { displayName: 'alice_new', palJson: '{"version":1}' });
    expect(seen.at(-1)?.alice.displayName).toBe('alice_new');
    expect(seen.at(-1)?.alice.palJson).toBe('{"version":1}');
  });

  it('leaves the Pal undefined when the friend has never published one', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const seen: Record<string, { palJson?: string }>[] = [];
    subscribeFriendLive(['alice'], (live) => seen.push(live as never));

    emit('localpoker/users/alice', { displayName: 'alice', handle: 'alice' });
    expect(seen.at(-1)?.alice.palJson).toBeUndefined();
  });

  it('keeps a friend gray when their presence cannot be read', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const seen: Record<string, { online: boolean }>[] = [];
    subscribeFriendLive(['alice'], (live) => seen.push(live as never));

    fail('localpoker/presence/alice', 'permission denied');
    expect(seen.at(-1)?.alice.online).toBe(false);
  });

  it('tracks each friend separately', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const seen: Record<string, { online: boolean }>[] = [];
    subscribeFriendLive(['alice', 'bob'], (live) => seen.push(live as never));

    emit('localpoker/presence/alice', { online: true, lastSeen: 1 });
    emit('localpoker/presence/bob', { online: false, lastSeen: 1 });

    expect(seen.at(-1)?.alice.online).toBe(true);
    expect(seen.at(-1)?.bob.online).toBe(false);
  });

  it('does nothing and reports nothing when Firebase is unconfigured', async () => {
    configured.value = false;
    const { subscribeFriendLive } = await import('../presence');
    const seen: unknown[] = [];
    const stop = subscribeFriendLive(['alice'], (live) => seen.push(live));
    expect(seen).toEqual([{}]);
    expect(() => stop()).not.toThrow();
  });

  it('detaches every listener it attached', async () => {
    const { subscribeFriendLive } = await import('../presence');
    const stop = subscribeFriendLive(['alice'], () => {});
    const attached = (listeners['localpoker/presence/alice'] ?? []).length
      + (listeners['localpoker/users/alice'] ?? []).length;
    expect(attached).toBe(2);
    stop();
    const left = (listeners['localpoker/presence/alice'] ?? []).length
      + (listeners['localpoker/users/alice'] ?? []).length;
    expect(left).toBe(0);
  });
});
