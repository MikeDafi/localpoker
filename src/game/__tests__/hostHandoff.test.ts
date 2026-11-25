import { describe, expect, it } from 'vitest';
import { applyAction, createGame, startHand, type GameState } from '../../engine';
import {
  decideHostHandoff,
  handoffLine,
  HOST_HANDOFF_AFTER_MS,
  HOST_HANDOFF_STAGGER_MS,
  nextHandAfterHandoff,
  pickNextHost,
  refundedStack,
} from '../hostHandoff';
import { redactGameState } from '../onlineSync';

const seat = (id: string, seatIndex: number, connected: boolean | undefined = true) => ({ id, name: id.toUpperCase(), seatIndex, connected });

describe('who takes over from a host', () => {
  it('is the lowest seat still at the table, whatever order the roster arrives in', () => {
    const players = { c: seat('c', 3), host: seat('host', 0), b: seat('b', 1), d: seat('d', 2) };
    expect(pickNextHost(players, 'host')).toBe('b');
    // Same roster, keys in another order: every phone must agree.
    expect(pickNextHost({ d: players.d, b: players.b, c: players.c, host: players.host }, 'host')).toBe('b');
    expect(handoffLine(players, 'host')).toEqual(['b', 'd', 'c']);
  });

  it('puts somebody known to be gone at the back of the line rather than first', () => {
    const players = { host: seat('host', 0), b: seat('b', 1, false), c: seat('c', 2) };
    expect(handoffLine(players, 'host')).toEqual(['c', 'b']);
  });

  it('is nobody when the host was the last one there', () => {
    expect(pickNextHost({ host: seat('host', 0) }, 'host')).toBeNull();
  });
});

describe('when a guest claims the host seat', () => {
  const T = 5_000_000;
  const base = {
    status: 'playing',
    hostId: 'host',
    players: { b: seat('b', 1), c: seat('c', 2) } as Record<string, ReturnType<typeof seat>>,
  };

  it('the first in line claims as soon as it sees the host has left', () => {
    expect(decideHostHandoff({ room: base, myId: 'b', now: T, hostGoneSince: T })).toEqual({ kind: 'claim' });
  });

  it('the next in line waits a stagger first, in case the first is asleep', () => {
    expect(decideHostHandoff({ room: base, myId: 'c', now: T, hostGoneSince: T }))
      .toEqual({ kind: 'wait', checkAt: T + HOST_HANDOFF_STAGGER_MS });
    expect(decideHostHandoff({ room: base, myId: 'c', now: T + HOST_HANDOFF_STAGGER_MS, hostGoneSince: T }))
      .toEqual({ kind: 'claim' });
  });

  it('nobody claims while the host is at the table', () => {
    const room = { ...base, players: { ...base.players, host: seat('host', 0) } };
    expect(decideHostHandoff({ room, myId: 'b', now: T })).toEqual({ kind: 'none' });
  });

  it('a host who dropped is waited for, then replaced', () => {
    const room = { ...base, hostAwayAt: T, players: { ...base.players, host: seat('host', 0, false) } };
    expect(decideHostHandoff({ room, myId: 'b', now: T + 1_000 })).toEqual({ kind: 'wait', checkAt: T + HOST_HANDOFF_AFTER_MS });
    expect(decideHostHandoff({ room, myId: 'b', now: T + HOST_HANDOFF_AFTER_MS })).toEqual({ kind: 'claim' });
  });

  it('a host marked connected is never replaced, whatever a stale away marker says', () => {
    const room = { ...base, hostAwayAt: T - 60_000, players: { ...base.players, host: seat('host', 0, true) } };
    expect(decideHostHandoff({ room, myId: 'b', now: T })).toEqual({ kind: 'none' });
  });

  it('nobody claims a table of one, a lobby, or a table they are not at', () => {
    expect(decideHostHandoff({ room: { ...base, players: { b: seat('b', 1) } }, myId: 'b', now: T })).toEqual({ kind: 'none' });
    expect(decideHostHandoff({ room: { ...base, status: 'lobby' }, myId: 'b', now: T })).toEqual({ kind: 'none' });
    expect(decideHostHandoff({ room: base, myId: 'stranger', now: T })).toEqual({ kind: 'none' });
  });
});

const config = { smallBlind: 5, bigBlind: 10, startingStack: 100, maxPlayers: 6, turnTimerSec: 30 };
const players = ['host', 'b', 'c'].map((id, seatIndex) => ({ id, name: id.toUpperCase(), seatIndex }));

function act(state: GameState, action: 'call' | 'check' | 'bet' | 'fold', amount?: number): GameState {
  const id = state.players[state.currentPlayerIndex]!.id;
  const result = applyAction(state, id, action, amount);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('the hand the host abandoned', () => {
  it('is refunded: every stack goes back to what it was before the cards were dealt', () => {
    const before = startHand(createGame(config, players, 'handoff-refund'));
    // A bet and a call on the flop, so there are bets on the street as
    // well as in the pot.
    let state = act(act(act(before, 'call'), 'call'), 'check');
    state = act(act(state, 'bet', 20), 'call');
    expect(state.street).toBe('flop');
    const { publicState } = redactGameState(state);
    const atDeal = Object.fromEntries(before.players.map((p) => [p.id, p.chips + (before.contributions[p.id] ?? 0)]));
    for (const id of ['host', 'b', 'c']) {
      expect(refundedStack(publicState, id)).toBe(atDeal[id]);
    }
  });

  it('is left alone once it reached the showdown, because the pot was already paid', () => {
    let state = startHand(createGame(config, players, 'handoff-settled'));
    state = act(act(state, 'fold'), 'fold');
    expect(state.street).toBe('showdown');
    const { publicState } = redactGameState(state);
    for (const p of state.players) expect(refundedStack(publicState, p.id)).toBe(p.chips);
  });
});

describe('the next hand the new host deals', () => {
  const midHand = (): GameState => act(act(startHand(createGame(config, players, 'handoff-next')), 'call'), 'call');

  it('comes from the refunded public chips, without the host who left, as the next hand', () => {
    const state = midHand();
    const { publicState } = redactGameState(state);
    const next = nextHandAfterHandoff({
      publicState,
      seated: [{ id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      seed: 'new-host',
    });
    expect(next).not.toBeNull();
    expect(next!.handNumber).toBe(state.handNumber + 1);
    expect(next!.street).toBe('preflop');
    expect(next!.players.map((p) => p.id)).toEqual(['b', 'c']);
    // Nobody gains or loses a chip: what is on the table is exactly what the
    // two of them had before the abandoned hand was dealt.
    const total = (s: GameState) => s.players.reduce((sum, p) => sum + p.chips + (s.contributions[p.id] ?? 0), 0);
    expect(total(next!)).toBe(refundedStack(publicState, 'b') + refundedStack(publicState, 'c'));
    expect(next!.deck.length).toBeGreaterThan(0);
    for (const p of next!.players) expect(p.holeCards).toHaveLength(2);
  });

  it('moves the button on from where it was', () => {
    const state = midHand();
    const { publicState } = redactGameState(state);
    const oldDealer = state.players[state.dealerIndex]!.id;
    const next = nextHandAfterHandoff({ publicState, seated: [{ id: 'host' }, { id: 'b' }, { id: 'c' }], seed: 'x' })!;
    expect(next.players[next.dealerIndex]!.id).not.toBe(oldDealer);
  });

  it('plays a tournament at the level the room says it is on', () => {
    const { publicState } = redactGameState(midHand());
    const next = nextHandAfterHandoff({
      publicState,
      seated: [{ id: 'b' }, { id: 'c' }],
      seed: 'x',
      level: { smallBlind: 25, bigBlind: 50, ante: 5 },
    })!;
    expect(next.config).toMatchObject({ smallBlind: 25, bigBlind: 50, ante: 5 });
  });

  it('is not dealt when fewer than two players with chips are left', () => {
    const { publicState } = redactGameState(midHand());
    expect(nextHandAfterHandoff({ publicState, seated: [{ id: 'b' }], seed: 'x' })).toBeNull();
  });
});
