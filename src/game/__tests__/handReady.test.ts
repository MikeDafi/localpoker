import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS } from '../connectionGrace';
import {
  NEXT_HAND_CONSENT_MS,
  decideNextHandDeal,
  evaluateNextHandReadiness,
  isReadyForHand,
  nextHandWaitLabel,
  sameDisconnectedSince,
  type HandReadyPlayer,
} from '../handReady';

const T = 1_000_000;

const player = (id: string, extras: Partial<HandReadyPlayer> = {}): HandReadyPlayer => ({
  id,
  name: id.toUpperCase(),
  seatIndex: id.charCodeAt(0),
  chips: 100,
  connected: true,
  ...extras,
});

const ready = (handNumber: number) => ({ handNumber, ts: T });

describe('next hand readiness', () => {
  it('counts a ready flag only for the hand it names', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 8,
      players: [player('a'), player('b')],
      ready: { a: ready(7), b: ready(8) },
      now: T,
    });

    expect(result.canStartNextHand).toBe(false);
    expect(result.waitingPlayers).toEqual([{ id: 'a', name: 'A' }]);
    expect(isReadyForHand(ready(7), 8)).toBe(false);
  });

  it('starts once every active seated human has readied this hand', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 8,
      players: [player('a'), player('b')],
      ready: { a: ready(8), b: ready(8) },
      now: T,
    });

    expect(result.canStartNextHand).toBe(true);
    expect(result.waitingPlayers).toEqual([]);
    expect(result.readyPlayerIds).toEqual(['a', 'b']);
  });

  it('does not wait on disconnected players after the grace window', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 4,
      players: [
        player('a'),
        player('b'),
        player('c', { connected: false }),
      ],
      ready: { a: ready(4), b: ready(4) },
      disconnectedSince: { c: T - DISCONNECT_GRACE_MS },
      now: T,
    });

    expect(result.canStartNextHand).toBe(true);
    expect(result.waitingPlayers).toEqual([]);
    expect(result.skippedPlayers).toEqual([{ id: 'c', name: 'C', reason: 'disconnected' }]);
  });

  it('still waits during the disconnection grace window', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 4,
      players: [player('a'), player('b', { connected: false })],
      ready: { a: ready(4) },
      now: T,
    });

    expect(result.canStartNextHand).toBe(false);
    expect(result.waitingPlayers).toEqual([{ id: 'b', name: 'B' }]);
    expect(result.disconnectedSince).toEqual({ b: T });
  });

  it('does not wait on players who are out, sitting out, or gone from the room', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 5,
      players: [
        player('a'),
        player('b'),
        player('busted'),
        player('away'),
      ],
      publicPlayers: {
        a: { chips: 80 },
        b: { chips: 120 },
        busted: { chips: 0 },
        away: { sittingOut: true },
        left: { chips: 100 },
      },
      ready: { a: ready(5), b: ready(5), left: ready(4) },
      now: T,
    });

    expect(result.canStartNextHand).toBe(true);
    expect(result.waitingPlayers).toEqual([]);
    expect(result.skippedPlayers).toEqual([
      { id: 'away', name: 'AWAY', reason: 'sittingOut' },
      { id: 'busted', name: 'BUSTED', reason: 'out' },
    ]);
  });

  it('treats bots as ready without a database flag', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 2,
      players: [player('human'), player('bot', { isBot: true })],
      ready: { human: ready(2) },
      now: T,
    });

    expect(result.canStartNextHand).toBe(true);
    expect(result.autoReadyPlayerIds).toEqual(['bot']);
    expect(result.waitingPlayers).toEqual([]);
  });

  it('does not invent a room blocker for solo play', () => {
    const result = evaluateNextHandReadiness({
      handNumber: 1,
      players: [],
      ready: null,
      now: T,
    });

    expect(result.canStartNextHand).toBe(false);
    expect(result.waitingPlayers).toEqual([]);
    expect(result.activePlayerIds).toEqual([]);
  });
});

describe('deciding when the host deals the next hand', () => {
  const host = player('host');
  const guest = player('guest');

  it('deals once the host has asked and every guest has too', () => {
    const readiness = evaluateNextHandReadiness({
      handNumber: 3,
      players: [host, guest],
      ready: { guest: ready(3) },
      now: T,
    });
    // The host's own flag never arrived, which is what a refused write
    // looks like. Its local ask is enough.
    expect(readiness.canStartNextHand).toBe(false);

    const decision = decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: T, rebuyWaiting: false, now: T,
    });
    expect(decision).toEqual({ deal: true, reason: 'everyone', waitingOn: [], secondsLeft: null });
  });

  it('deals anyway once the deadline passes, so a missing answer cannot stop the table', () => {
    // Build 46: a guest whose flag never lands (refused write, locked phone,
    // a seat still marked connected) held every hand forever.
    const readiness = evaluateNextHandReadiness({
      handNumber: 3,
      players: [host, guest],
      ready: {},
      now: T,
    });

    const early = decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: T, rebuyWaiting: false, now: T + 1_000,
    });
    expect(early.deal).toBe(false);
    expect(early.waitingOn).toEqual([{ id: 'guest', name: 'GUEST' }]);
    expect(early.secondsLeft).toBe(Math.ceil((NEXT_HAND_CONSENT_MS - 1_000) / 1000));

    const late = decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: T, rebuyWaiting: false, now: T + NEXT_HAND_CONSENT_MS,
    });
    expect(late).toMatchObject({ deal: true, reason: 'deadline' });
  });

  it('does not deal before the host has asked, even with every guest ready', () => {
    const readiness = evaluateNextHandReadiness({
      handNumber: 3,
      players: [host, guest],
      ready: { guest: ready(3) },
      now: T,
    });

    const decision = decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: null, rebuyWaiting: false, now: T + 60_000,
    });
    expect(decision.deal).toBe(false);
    expect(decision.secondsLeft).toBeNull();
  });

  it('never deals over an open rebuy window, so the deal is not spent on a bail-out', () => {
    const readiness = evaluateNextHandReadiness({
      handNumber: 3,
      players: [host, guest],
      ready: { host: ready(3), guest: ready(3) },
      now: T,
    });

    expect(decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: T, rebuyWaiting: true, now: T + 60_000,
    }).deal).toBe(false);
    expect(decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: T, rebuyWaiting: false, now: T + 1,
    }).deal).toBe(true);
  });

  it('waits on a folded player like anyone else, because their panel offers the button too', () => {
    // Folding is not part of readiness at all: the result panel and its Next
    // Hand button are shown to every seat once the hand is over.
    const readiness = evaluateNextHandReadiness({
      handNumber: 9,
      players: [host, guest, player('folder')],
      publicPlayers: { folder: { chips: 90 } },
      ready: { guest: ready(9), folder: ready(9) },
      now: T,
    });

    expect(decideNextHandDeal({
      readiness, hostId: 'host', hostAskedAt: T, rebuyWaiting: false, now: T,
    }).reason).toBe('everyone');
  });

  it('stops waiting on someone who left once the carried grace window runs out', () => {
    const players = [host, player('gone', { connected: false })];
    const first = evaluateNextHandReadiness({ handNumber: 2, players, ready: {}, now: T });
    expect(first.waitingPlayers.map((p) => p.id)).toContain('gone');

    // Carrying `disconnectedSince` forward is what lets the window expire.
    const later = evaluateNextHandReadiness({
      handNumber: 2,
      players,
      ready: {},
      disconnectedSince: first.disconnectedSince,
      now: T + DISCONNECT_GRACE_MS,
    });
    expect(later.skippedPlayers).toEqual([{ id: 'gone', name: 'GONE', reason: 'disconnected' }]);
  });
});

describe('carrying disconnection times between evaluations', () => {
  it('compares by value', () => {
    expect(sameDisconnectedSince({}, {})).toBe(true);
    expect(sameDisconnectedSince({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameDisconnectedSince({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameDisconnectedSince({ a: 1 }, {})).toBe(false);
    expect(sameDisconnectedSince({ a: 1 }, { b: 1 })).toBe(false);
  });
});

describe('the Next Hand label once you have asked', () => {
  it('names one player, counts several, and never says zero', () => {
    expect(nextHandWaitLabel({ waitingOn: [] })).toBe('Dealing…');
    expect(nextHandWaitLabel({ waitingOn: [{ id: 'b', name: 'Bo' }] })).toBe('Waiting for Bo…');
    expect(nextHandWaitLabel({ waitingOn: [{ id: 'b', name: 'Bo' }], secondsLeft: 7 })).toBe('Waiting for Bo… 7s');
    expect(nextHandWaitLabel({
      waitingOn: [{ id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' }],
      secondsLeft: 0,
    })).toBe('Waiting for 2 players…');
  });
});
