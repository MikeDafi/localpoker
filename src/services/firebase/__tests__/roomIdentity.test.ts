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
const ensureSignedIn = vi.fn<() => Promise<string | null>>(async () => AUTH_UID);

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
  update: async (r: { path: string }, value: unknown) => { writes.push({ path: r.path, value }); },
  get: async () => ({ exists: () => false, val: () => null }),
  push: (r: { path: string }) => ({ path: `${r.path}/pushed`, key: 'pushed' }),
  onValue: () => () => {},
  onChildAdded: () => () => {},
  onDisconnect: () => ({ set: async () => {}, cancel: async () => {} }),
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

    await pushAction('ROOM12', {
      playerId: LOCAL_PROFILE_ID,
      type: 'fold',
      seq: 1,
    } as never);

    const written = writes.map((w) => w.value as Record<string, { playerId?: string }>);
    const action = Object.values(written[0]).find((v) => v && typeof v === 'object' && 'playerId' in v);
    expect(action?.playerId).toBe(AUTH_UID);
  });
});
