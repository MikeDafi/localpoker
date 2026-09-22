import { describe, expect, it } from 'vitest';
import { applyAction, createGame, startHand } from '../../engine/holdem';
import type { ActionResult, GameConfig, GameState, PlayerInput } from '../../engine/types';
import {
  emptyObservedTable,
  observeTransition,
  observedStats,
  playerRead,
  type ObservedTable,
} from '../observedStats';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 200,
  maxPlayers: 6,
  turnTimerSec: 30,
};

function players(ids: string[]): PlayerInput[] {
  return ids.map((id, seatIndex) => ({ id, name: id.toUpperCase(), seatIndex }));
}

function must(result: ActionResult): GameState {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  return result.state;
}

/**
 * Drives the real engine and feeds every resulting state to the observer, so
 * what is asserted is inference against ground truth rather than against a
 * hand-written fixture that could share the same misunderstanding.
 */
class Watcher {
  table: ObservedTable = emptyObservedTable();
  private prev: GameState | null = null;

  see(state: GameState): GameState {
    this.table = observeTransition(this.table, this.prev, state);
    this.prev = state;
    return state;
  }

  act(state: GameState, id: string, action: Parameters<typeof applyAction>[2], amount?: number): GameState {
    return this.see(must(applyAction(state, id, action, amount)));
  }

  of(id: string) {
    return this.table.counters[id];
  }
}

describe('observed opponent stats', () => {
  it('counts every seated player into each hand', () => {
    const w = new Watcher();
    w.see(startHand(createGame(config, players(['a', 'b', 'c']))));
    expect(w.of('a').handsSeen).toBe(1);
    expect(w.of('b').handsSeen).toBe(1);
    expect(w.of('c').handsSeen).toBe(1);
  });

  it('does not count a blind as voluntarily entering the pot', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b', 'c']))));
    // Everyone folds round to the big blind, who never chose to put money in.
    const order = s.players.map((p) => p.id);
    const toAct = order[s.currentPlayerIndex];
    s = w.act(s, toAct, 'fold');
    const next = s.players[s.currentPlayerIndex].id;
    s = w.act(s, next, 'fold');
    for (const id of order) {
      expect(w.of(id).vpipHands, `${id} should not be credited with VPIP`).toBe(0);
    }
  });

  it('separates a call from a raise', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b', 'c']))));
    const first = s.players[s.currentPlayerIndex].id;
    s = w.act(s, first, 'call');
    expect(w.of(first).calls).toBe(1);
    expect(w.of(first).aggressiveActions).toBe(0);
    expect(w.of(first).vpipHands).toBe(1);
    expect(w.of(first).pfrHands).toBe(0);

    const second = s.players[s.currentPlayerIndex].id;
    s = w.act(s, second, 'raise', 30);
    expect(w.of(second).aggressiveActions).toBe(1);
    expect(w.of(second).pfrHands).toBe(1);
    expect(w.of(second).vpipHands).toBe(1);
  });

  it('credits VPIP once however many times a player puts money in', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b', 'c']))));
    const first = s.players[s.currentPlayerIndex].id;
    s = w.act(s, first, 'call');
    const second = s.players[s.currentPlayerIndex].id;
    s = w.act(s, second, 'raise', 30);
    const third = s.players[s.currentPlayerIndex].id;
    s = w.act(s, third, 'call');
    s = w.act(s, first, 'call'); // first player pays the raise too
    expect(w.of(first).vpipHands).toBe(1);
    expect(w.of(first).calls).toBe(2);
  });

  it('sees the bet that ends a street, where current bets get zeroed', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b']))));
    // Get heads-up to the flop.
    const first = s.players[s.currentPlayerIndex].id;
    s = w.act(s, first, 'call');
    const second = s.players[s.currentPlayerIndex].id;
    s = w.act(s, second, 'check');
    expect(s.street).toBe('flop');

    const flopFirst = s.players[s.currentPlayerIndex].id;
    const before = w.of(flopFirst).aggressiveActions;
    s = w.act(s, flopFirst, 'bet', 20);
    const caller = s.players[s.currentPlayerIndex].id;
    const callsBefore = w.of(caller).calls;
    // This call closes the street, so the engine resets both current bets.
    s = w.act(s, caller, 'call');
    expect(s.street).toBe('turn');
    expect(w.of(flopFirst).aggressiveActions).toBe(before + 1);
    expect(w.of(caller).calls, 'a street-closing call must still be counted').toBe(callsBefore + 1);
  });

  it('records the winner of a hand', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b']))));
    const first = s.players[s.currentPlayerIndex].id;
    const other = s.players.find((p) => p.id !== first)!.id;
    s = w.act(s, first, 'fold');
    expect(s.winners.length).toBeGreaterThan(0);
    expect(w.of(other).handsWon).toBe(1);
    // Nobody's cards were compared, so this is not a showdown.
    expect(w.of(other).showdowns).toBe(0);
  });

  it('counts a showdown only when cards are actually compared', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b']))));
    const first = s.players[s.currentPlayerIndex].id;
    s = w.act(s, first, 'call');
    let guard = 0;
    while (s.street !== 'showdown' && guard++ < 20) {
      const id = s.players[s.currentPlayerIndex]?.id;
      if (!id) break;
      s = w.act(s, id, 'check');
    }
    expect(s.street).toBe('showdown');
    expect(w.of('a').showdowns).toBe(1);
    expect(w.of('b').showdowns).toBe(1);
    const winners = s.winners.filter((x) => x.amount > 0).map((x) => x.playerId);
    for (const id of winners) expect(w.of(id).showdownWins).toBe(1);
  });

  it('keeps counting across hands', () => {
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b']))));
    const first = s.players[s.currentPlayerIndex].id;
    s = w.act(s, first, 'fold');
    s = w.see(startHand(s));
    expect(w.of('a').handsSeen).toBe(2);
    expect(w.of('b').handsSeen).toBe(2);
  });

  it('is pure, so a replayed transition cannot double count', () => {
    // Build up a table with some history, then snapshot it.
    const w = new Watcher();
    let s = w.see(startHand(createGame(config, players(['a', 'b', 'c']))));
    const first = s.players[s.currentPlayerIndex].id;
    s = w.act(s, first, 'call');
    const base = w.table;
    const snapshot = structuredClone(base);
    expect(base.counters[first].calls).toBe(1);

    // Applying the next transition must not reach back and edit the base, which
    // is exactly what a shallow copy of `counters` would have allowed.
    const second = s.players[s.currentPlayerIndex].id;
    const next = must(applyAction(s, second, 'raise', 30));
    const after = observeTransition(base, s, next);
    expect(base).toEqual(snapshot);
    expect(after.counters[second].aggressiveActions).toBe(1);

    // React re-runs state updaters in development; the same transition applied
    // twice from the same base has to give the same answer, not twice the count.
    const afterAgain = observeTransition(base, s, next);
    expect(afterAgain).toEqual(after);
  });

  it('reports nothing rather than zero before anyone has played', () => {
    const s = observedStats(undefined);
    expect(s.vpip).toBeNull();
    expect(s.pfr).toBeNull();
    expect(s.af).toBeNull();
    expect(s.showdownWinRate).toBeNull();
    expect(s.handsSeen).toBe(0);
  });

  it('turns counts into percentages', () => {
    const s = observedStats({
      handsSeen: 20,
      vpipHands: 5,
      pfrHands: 3,
      aggressiveActions: 6,
      calls: 4,
      handsWon: 2,
      showdowns: 4,
      showdownWins: 3,
    });
    expect(s.vpip).toBe(25);
    expect(s.pfr).toBe(15);
    expect(s.af).toBe(1.5);
    expect(s.winRate).toBe(10);
    expect(s.showdownWinRate).toBe(75);
  });

  it('withholds a read until it has seen enough hands', () => {
    const few = observedStats({ ...zero(), handsSeen: 4, vpipHands: 3, pfrHands: 3 });
    expect(playerRead(few)).toBeNull();
    const loose = observedStats({ ...zero(), handsSeen: 40, vpipHands: 24, pfrHands: 4 });
    expect(playerRead(loose)).toBe('Loose & passive');
    const nit = observedStats({ ...zero(), handsSeen: 40, vpipHands: 6, pfrHands: 5 });
    expect(playerRead(nit)).toBe('Tight & aggressive');
  });
});

function zero() {
  return {
    handsSeen: 0,
    vpipHands: 0,
    pfrHands: 0,
    aggressiveActions: 0,
    calls: 0,
    handsWon: 0,
    showdowns: 0,
    showdownWins: 0,
  };
}
