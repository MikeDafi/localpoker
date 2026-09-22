import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression guard for the bug that made online play impossible.
 *
 * `database.rules.json` scopes every room write to `auth.uid` — the room's
 * `hostId`, the `players/$uid` path and each action's `playerId` must all equal
 * it. The lobby passed the locally generated `profile.id` instead, so the moment
 * the hardened rules were published every online write (create, join, act) would
 * have been rejected. These tests pin the identity that actually reaches the
 * database.
 */

const AUTH_UID = 'firebaseuidabc123';
const LOCAL_PROFILE_ID = 'localprofilezzz999';

const writes: { path: string; value: unknown }[] = [];
const disconnectWrites: { path: string; value: unknown }[] = [];
const valueHandlers: Array<(snapshot: { val: () => unknown }) => void> = [];
const ensureSignedIn = vi.fn<() => Promise<string | null>>(async () => AUTH_UID);
const readValues = new Map<string, unknown>();
let updateError: Error | null = null;

vi.mock('../config', () => ({
  isFirebaseConfigured: () => true,
  getDb: () => ({}),
}));

vi.mock('../auth', () => ({
  ensureSignedIn: () => ensureSignedIn(),
  getAuthUid: () => AUTH_UID,
}));

vi.mock('../../telemetry', () => ({
  captureError: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path?: string) => ({ path: path ?? '' }),
  set: async (r: { path: string }, value: unknown) => { writes.push({ path: r.path, value }); },
  update: async (r: { path: string }, value: unknown) => {
    if (updateError) throw updateError;
    writes.push({ path: r.path, value });
  },
  get: async (r: { path: string }) => ({
    exists: () => readValues.has(r.path),
    val: () => readValues.get(r.path) ?? null,
  }),
  push: (r: { path: string }) => ({ path: `${r.path}/pushed`, key: 'pushed' }),
  onValue: (_r: { path: string }, cb: (snapshot: { val: () => unknown }) => void) => {
    valueHandlers.push(cb);
    return () => {};
  },
  onChildAdded: () => () => {},
  onDisconnect: (r: { path: string }) => ({
    set: async (value: unknown) => { disconnectWrites.push({ path: r.path, value }); },
    update: async (value: unknown) => { disconnectWrites.push({ path: r.path, value }); },
    cancel: async () => {},
  }),
  serverTimestamp: () => 1,
  off: () => {},
}));

const player = {
  id: LOCAL_PROFILE_ID,
  name: 'Sneaky Ace',
  palSeed: LOCAL_PROFILE_ID,
  seatIndex: 0,
  chips: 2000,
  connected: true,
  isHost: true,
};

describe('room writes are keyed by auth.uid', () => {
  beforeEach(() => {
    writes.length = 0;
    disconnectWrites.length = 0;
    valueHandlers.length = 0;
    readValues.clear();
    updateError = null;
    ensureSignedIn.mockClear();
    ensureSignedIn.mockResolvedValue(AUTH_UID);
  });

  it('creates a room with hostId set to the auth uid, not the local profile id', async () => {
    const { createRoom } = await import('../roomSync');
    const result = await createRoom('ROOM12', player, '{}');

    expect(result.ok).toBe(true);
    const room = writes[0].value as {
      hostId: string;
      players: Record<string, { id: string; palSeed: string }>;
    };

    // The three things the rules actually check.
    expect(room.hostId).toBe(AUTH_UID);
    expect(Object.keys(room.players)).toEqual([AUTH_UID]);
    expect(room.players[AUTH_UID].id).toBe(AUTH_UID);

    // palSeed is cosmetic (it seeds the avatar), so it deliberately keeps the
    // local profile id — the player's avatar shouldn't change when they sign in.
    expect(room.players[AUTH_UID].palSeed).toBe(LOCAL_PROFILE_ID);
    expect(disconnectWrites).toContainEqual({
      path: 'localpoker/rooms/ROOM12',
      value: expect.objectContaining({
        status: 'ended',
        endedReason: 'Host disconnected.',
      }),
    });
  });

  it('refuses to write when the player could not be signed in', async () => {
    ensureSignedIn.mockResolvedValueOnce(null);
    const { createRoom } = await import('../roomSync');

    const result = await createRoom('ROOM12', player, '{}');

    // Better to surface a clear error than write something the rules reject.
    expect(result.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('stamps actions with the auth uid even if the caller supplies another id', async () => {
    const { pushAction } = await import('../roomSync');

    const result = await pushAction('ROOM12', {
      playerId: LOCAL_PROFILE_ID,
      type: 'fold',
      seq: 1,
    } as never);

    expect(result.ok).toBe(true);
    const written = writes.map((w) => w.value as Record<string, { playerId?: string }>);
    const action = Object.values(written[0]).find((v) => v && typeof v === 'object' && 'playerId' in v);
    expect(action?.playerId).toBe(AUTH_UID);
  });

  it('uses the room action sequence when the local clock is behind another player', async () => {
    readValues.set('localpoker/rooms/ROOM12/actionSeq', 5000);
    const { pushAction } = await import('../roomSync');

    const result = await pushAction('ROOM12', {
      playerId: LOCAL_PROFILE_ID,
      type: 'call',
      seq: 1000,
      ts: 1000,
    });

    expect(result).toMatchObject({
      ok: true,
      action: expect.objectContaining({ seq: 5001, playerId: AUTH_UID }),
    });
    expect(writes[0].value).toMatchObject({
      'localpoker/rooms/ROOM12/actionSeq': 5001,
      'localpoker/rooms/ROOM12/actions/pushed': expect.objectContaining({ seq: 5001 }),
    });
  });

  it('returns a failure when Firebase rejects an action write', async () => {
    updateError = new Error('permission_denied');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pushAction } = await import('../roomSync');

    try {
      const result = await pushAction('ROOM12', {
        playerId: LOCAL_PROFILE_ID,
        type: 'fold',
        seq: 1,
        ts: 1,
      });

      expect(result).toEqual({ ok: false, reason: 'permission_denied' });
    } finally {
      warn.mockRestore();
    }
  });

  it('returns a failure instead of writing when the room sequence cannot advance', async () => {
    readValues.set('localpoker/rooms/ROOM12/actionSeq', Number.MAX_SAFE_INTEGER);
    const { pushAction } = await import('../roomSync');

    const result = await pushAction('ROOM12', {
      playerId: LOCAL_PROFILE_ID,
      type: 'fold',
      seq: Number.MAX_SAFE_INTEGER,
      ts: 1,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'Room action sequence is invalid. Leave and recreate the room.',
    });
    expect(writes).toHaveLength(0);
  });

  it('delivers actions once in sequence order and ignores stale replays', async () => {
    const { subscribeActions } = await import('../roomSync');
    const delivered: number[] = [];

    subscribeActions('ROOM12', (action) => {
      delivered.push(action.seq);
    });

    const emitActions = valueHandlers[valueHandlers.length - 1]!;
    emitActions({
      val: () => ({
        second: { playerId: AUTH_UID, type: 'check', seq: 2, ts: 2 },
        first: { playerId: AUTH_UID, type: 'call', seq: 1, ts: 1 },
      }),
    });
    emitActions({
      val: () => ({
        second: { playerId: AUTH_UID, type: 'check', seq: 2, ts: 2 },
        replayWithNewKey: { playerId: AUTH_UID, type: 'call', seq: 1, ts: 3 },
        duplicateSeq: { playerId: AUTH_UID, type: 'fold', seq: 2, ts: 4 },
        third: { playerId: AUTH_UID, type: 'check', seq: 3, ts: 5 },
      }),
    });

    expect(delivered).toEqual([1, 2, 3]);
  });
});
