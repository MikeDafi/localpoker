import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS } from '../connectionGrace';
import { evaluateNextHandReadiness, isReadyForHand, type HandReadyPlayer } from '../handReady';

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
