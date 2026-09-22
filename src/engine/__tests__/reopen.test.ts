import { describe, it, expect } from 'vitest';
import { createGame, legalActions, applyAction } from '../holdem';
import type { GameState } from '../types';

function flopState(cChips: number): GameState {
  const g = createGame(
    { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 },
    [
      { id: 'a', name: 'A', chips: 1000, seatIndex: 0 },
      { id: 'b', name: 'B', chips: 1000, seatIndex: 1 },
      { id: 'c', name: 'C', chips: cChips, seatIndex: 2 },
    ],
    1,
  );
  const deck = [...g.deck];
  return {
    ...g,
    street: 'flop',
    deck,
    board: [],
    currentBet: 0,
    minRaise: 10,
    dealerIndex: 2,
    currentPlayerIndex: 0,
    lastAggressorIndex: null,
    players: g.players.map((p) => ({ ...p, holeCards: [deck.pop()!, deck.pop()!], currentBet: 0, hasActed: false, folded: false, allIn: false })),
    contributions: {},
  };
}

function ok(r: ReturnType<typeof applyAction>): GameState {
  expect(r.ok, r.ok ? undefined : r.error).toBe(true);
  return (r as { ok: true; state: GameState }).state;
}

describe('below-min all-in does not reopen betting', () => {
  it('a prior caller may only call/fold (not raise) after a short all-in', () => {
    let s = flopState(55); // c can only reach 55 (raise of 15 < minRaise 40)
    s = ok(applyAction(s, 'a', 'bet', 40));
    s = ok(applyAction(s, 'b', 'call'));
    s = ok(applyAction(s, 'c', 'allin'));
    const la = legalActions(s, 'a');
    expect(la.actions).toContain('call');
    expect(la.actions).toContain('fold');
    expect(la.actions).not.toContain('raise');
  });

  it('a full all-in raise DOES reopen betting (raise still offered)', () => {
    let s = flopState(80); // c reaches 80 (raise of 40 >= minRaise 40 → full raise)
    s = ok(applyAction(s, 'a', 'bet', 40));
    s = ok(applyAction(s, 'b', 'call'));
    s = ok(applyAction(s, 'c', 'allin'));
    const la = legalActions(s, 'a');
    expect(la.actions).toContain('raise');
  });
});
