import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, startHand, type GameState } from '../../../engine';
import { redactGameState } from '../../../game/onlineSync';

/*
 * The room writes behind a host handing over, and behind a host's own flip,
 * against a recorded fake database. The rules side of the same writes is in
 * scripts/rules-unit-check.cjs.
 */

let authUid = 'host';
const writes: { path: string; value: unknown }[] = [];
const readValues = new Map<string, unknown>();

vi.mock('../config', () => ({ isFirebaseConfigured: () => true, getDb: () => ({}) }));
vi.mock('../auth', () => ({ ensureSignedIn: async () => authUid, getAuthUid: () => authUid }));
vi.mock('../../telemetry', () => ({ captureError: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock('../push', () => ({ sendPush: vi.fn() }));
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path?: string) => ({ path: path ?? '' }),
  set: async (r: { path: string }, value: unknown) => { writes.push({ path: r.path, value }); },
  update: async (r: { path: string }, value: unknown) => { writes.push({ path: r.path, value }); },
  get: async (r: { path: string }) => ({ exists: () => readValues.has(r.path), val: () => readValues.get(r.path) ?? null }),
  push: (r: { path: string }) => ({ path: `${r.path}/pushed`, key: 'pushed' }),
  onValue: () => () => {},
  onChildAdded: () => () => {},
  onDisconnect: () => ({ set: async () => {}, update: async () => {}, cancel: async () => {} }),
  serverTimestamp: () => 1,
  off: () => {},
  query: (r: unknown) => r,
  orderByChild: () => null,
  limitToLast: () => null,
}));

const ROOM = 'localpoker/rooms/HAND1';
// Its own room: the publish chain remembers the last hand per room for the
// whole module, and a later hand from another test would drop this one.
const FLIP = 'localpoker/rooms/FLIP1';
const rootUpdates = () => writes.filter((w) => w.path === '').map((w) => w.value as Record<string, unknown>);
const merged = () => rootUpdates().reduce<Record<string, unknown>>((all, u) => ({ ...all, ...u }), {});

const seat = (id: string, seatIndex: number, isHost = false) => ({ id, name: id, seatIndex, chips: 100, connected: true, isHost });
const config = { smallBlind: 5, bigBlind: 10, startingStack: 100, maxPlayers: 6, turnTimerSec: 30 };

function midHand(): GameState {
  let state = startHand(createGame(config, ['host', 'b', 'c'].map((id, seatIndex) => ({ id, name: id, seatIndex })), 'room-handoff'));
  for (const action of ['call', 'call'] as const) {
    const r = applyAction(state, state.players[state.currentPlayerIndex]!.id, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

beforeEach(() => {
  writes.length = 0;
  readValues.clear();
  authUid = 'host';
});

describe('a host leaving a game', () => {
  it('with two others still seated gets up and leaves the hand for a successor, rather than ending the room', async () => {
    const { publicState } = redactGameState(midHand());
    readValues.set(ROOM, {
      code: 'HAND1', hostId: 'host', status: 'playing', settingsJson: '{}', actionSeq: 3, publicState,
      players: { host: seat('host', 0, true), b: seat('b', 1), c: seat('c', 2) },
    });
    const { leaveRoom } = await import('../roomSync');
    await leaveRoom('HAND1', 'host');
    const u = merged();
    expect(u[`${ROOM}/players/host`]).toBeNull();
    expect(u[`${ROOM}/status`]).toBeUndefined();
    // The successor deals the next hand from this, so it must survive.
    expect(u[`${ROOM}/publicState`]).toBeUndefined();
  });

  it('with only one other still seated ends the room as before', async () => {
    readValues.set(ROOM, {
      code: 'HAND1', hostId: 'host', status: 'playing', settingsJson: '{}', actionSeq: 3,
      players: { host: seat('host', 0, true), b: seat('b', 1) },
    });
    const { leaveRoom } = await import('../roomSync');
    await leaveRoom('HAND1', 'host');
    expect(merged()[`${ROOM}/status`]).toBe('ended');
  });
});

describe('a guest taking over', () => {
  it('claims first, then deals the next hand from the refunded public chips', async () => {
    const state = midHand();
    const { publicState } = redactGameState(state);
    authUid = 'b';
    readValues.set(ROOM, {
      code: 'HAND1', hostId: 'host', status: 'playing', settingsJson: '{}', actionSeq: 3, publicState,
      players: { b: seat('b', 1), c: seat('c', 2) },
    });
    const { claimHost, getCachedHostGame } = await import('../roomSync');
    // The publish reads the room again; by then the claim has landed.
    const claimed = () => readValues.set(ROOM, { ...(readValues.get(ROOM) as object), hostId: 'b' });
    const originalPush = writes.push.bind(writes);
    writes.push = (...items) => {
      const n = originalPush(...items);
      if (items.some((w) => (w.value as Record<string, unknown> | null)?.[`${ROOM}/hostId`] === 'b')) claimed();
      return n;
    };

    const result = await claimHost('HAND1');
    writes.push = originalPush;
    expect(result.ok).toBe(true);

    const [claim, ...rest] = rootUpdates();
    expect(claim).toMatchObject({
      [`${ROOM}/hostId`]: 'b',
      [`${ROOM}/hostAwayAt`]: null,
      [`${ROOM}/players/b/isHost`]: true,
      [`${ROOM}/players/b/connected`]: true,
    });
    const table = rest.find((u) => u[`${ROOM}/publicState`]);
    const next = table?.[`${ROOM}/publicState`] as { handNumber: number; playerOrder: string[] };
    expect(next.handNumber).toBe(state.handNumber + 1);
    expect(next.playerOrder).toEqual(['b', 'c']);
    // Last hand's queue, reveals and votes go with it.
    expect(table?.[`${ROOM}/actions`]).toBeNull();
    expect(getCachedHostGame('HAND1')?.handNumber).toBe(state.handNumber + 1);
  });

  it('does not claim while the host is still at the table', async () => {
    authUid = 'b';
    readValues.set(ROOM, {
      code: 'HAND1', hostId: 'host', status: 'playing', settingsJson: '{}', actionSeq: 3,
      players: { host: seat('host', 0, true), b: seat('b', 1), c: seat('c', 2) },
    });
    const { claimHost } = await import('../roomSync');
    expect((await claimHost('HAND1')).ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe('a host flipping its own cards', () => {
  it('republishes the same hand with both cards public, read from the room', async () => {
    let state = startHand(createGame(config, [{ id: 'host', name: 'turbo', seatIndex: 0 }, { id: 'b', name: 'b', seatIndex: 1 }], 'own-flip'));
    while (state.street !== 'showdown') {
      const p = state.players[state.currentPlayerIndex]!;
      const r = applyAction(state, p.id, state.currentBet > p.currentBet ? 'call' : 'check');
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const room = {
      code: 'FLIP1', hostId: 'host', status: 'playing', settingsJson: '{}', actionSeq: 0,
      players: { host: seat('host', 0, true), b: seat('b', 1) },
    };
    readValues.set(FLIP, room);
    const { publishHostGameState } = await import('../roomSync');
    expect((await publishHostGameState('FLIP1', state)).ok).toBe(true);
    const first = merged()[`${FLIP}/publicState`];

    readValues.set(FLIP, { ...room, publicState: first, shown: { host: true }, exposed: { host: [true, true] } });
    writes.length = 0;
    expect((await publishHostGameState('FLIP1', state)).ok).toBe(true);
    const again = merged()[`${FLIP}/publicState`] as { players: Record<string, { exposedHoleCards?: unknown }> };
    const host = state.players.find((p) => p.id === 'host')!;
    expect(again.players.host!.exposedHoleCards).toEqual({ 0: host.holeCards[0], 1: host.holeCards[1] });
    // Same hand, so the flip itself is not cleared by its own republish.
    expect(merged()[`${FLIP}/exposed`]).toBeUndefined();
  });
});
