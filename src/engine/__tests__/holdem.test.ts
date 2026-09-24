import { describe, expect, it } from 'vitest';
import { type Card, type Rank, type Suit } from '../cards';
import { applyAction, advanceStreet, createGame, legalActions, startHand } from '../holdem';
import type { ActionResult, GameConfig, GameState, PlayerInput } from '../types';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 100,
  maxPlayers: 6,
  turnTimerSec: 30,
};

const rankMap: Record<string, Rank> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function card(value: string): Card {
  return { rank: rankMap[value.slice(0, -1)], suit: value.slice(-1) as Suit };
}

function must(result: ActionResult): GameState {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  return result.state;
}

function players(ids = ['a', 'b', 'c']): PlayerInput[] {
  return ids.map((id, seatIndex) => ({ id, name: id.toUpperCase(), seatIndex }));
}

function winnerAmount(state: GameState, playerId: string): number {
  return state.winners.find((winner) => winner.playerId === playerId)?.amount ?? 0;
}

describe('holdem engine', () => {
  it('posts blinds, deals two hole cards, and sets first action', () => {
    const state = startHand(createGame(config, players(), 'blinds'));

    expect(state.dealerIndex).toBe(0);
    expect(state.players.map((player) => player.holeCards.length)).toEqual([2, 2, 2]);
    expect(state.board).toHaveLength(0);
    expect(state.deck).toHaveLength(46);
    expect(state.contributions).toMatchObject({ b: 5, c: 10 });
    expect(state.players[1].chips).toBe(95);
    expect(state.players[2].chips).toBe(90);
    expect(state.currentBet).toBe(10);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it('plays a deterministic heads-up hand through showdown', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'scripted-showdown'));

    state = must(applyAction(state, 'a', 'call'));
    state = must(applyAction(state, 'b', 'check'));
    expect(state.street).toBe('flop');
    expect(state.board).toHaveLength(3);

    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    expect(state.street).toBe('turn');

    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    expect(state.street).toBe('river');

    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));

    expect(state.street).toBe('showdown');
    expect(state.board).toHaveLength(5);
    expect(state.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(20);
    expect(state.players.reduce((sum, player) => sum + player.chips, 0)).toBe(200);
  });

  it('enforces minimum raises and rejects illegal checks', () => {
    const state = startHand(createGame(config, players(), 'raise-rules'));

    const illegalCheck = applyAction(state, 'a', 'check');
    expect(illegalCheck.ok).toBe(false);
    if (!illegalCheck.ok) expect(illegalCheck.error).toMatch(/check is not legal|Cannot check/);

    const illegalRaise = applyAction(state, 'a', 'raise', 19);
    expect(illegalRaise.ok).toBe(false);
    if (!illegalRaise.ok) expect(illegalRaise.error).toMatch(/Minimum raise/);

    const legalRaise = must(applyAction(state, 'a', 'raise', 20));
    expect(legalRaise.currentBet).toBe(20);
    expect(legalRaise.minRaise).toBe(10);
    expect(legalRaise.players[0].currentBet).toBe(20);
  });

  it('awards the pot immediately when everyone folds to one player', () => {
    let state = startHand(createGame(config, players(), 'folds'));
    state = must(applyAction(state, 'a', 'fold'));
    state = must(applyAction(state, 'b', 'fold'));

    expect(state.street).toBe('showdown');
    expect(state.winners).toEqual([{ playerId: 'c', amount: 15 }]);
    expect(state.players.find((player) => player.id === 'c')?.chips).toBe(105);
  });

  it('computes all-in side pots and distributes each pot to the correct winner', () => {
    const base = createGame(config, players(['a', 'b', 'c']), 'side-pots');
    const state: GameState = {
      ...base,
      street: 'river',
      dealerIndex: 2,
      currentPlayerIndex: -1,
      board: [card('2c'), card('3d'), card('4h'), card('9s'), card('Td')],
      players: base.players.map((player) => {
        if (player.id === 'a') return { ...player, chips: 0, holeCards: [card('As'), card('5s')], allIn: true };
        if (player.id === 'b') return { ...player, chips: 0, holeCards: [card('Tc'), card('Th')], allIn: true };
        return { ...player, chips: 0, holeCards: [card('Ks'), card('Qs')], allIn: true };
      }),
      contributions: { a: 50, b: 100, c: 200 },
      pots: [],
    };

    const result = advanceStreet(state);

    expect(result.street).toBe('showdown');
    expect(winnerAmount(result, 'a')).toBe(150);
    expect(winnerAmount(result, 'b')).toBe(100);
    expect(winnerAmount(result, 'c')).toBe(100);
    expect(result.players.reduce((sum, player) => sum + player.chips, 0)).toBe(350);
  });

  it('splits tied pots and gives odd chips to the first tied player left of the dealer', () => {
    const base = createGame(config, players(['a', 'b', 'c']), 'split-pot');
    const state: GameState = {
      ...base,
      street: 'river',
      dealerIndex: 0,
      currentPlayerIndex: -1,
      board: [card('As'), card('Kd'), card('Qh'), card('Jc'), card('Ts')],
      players: base.players.map((player) => {
        if (player.id === 'a') return { ...player, chips: 0, holeCards: [card('2c'), card('3c')], allIn: true };
        if (player.id === 'b') return { ...player, chips: 0, holeCards: [card('4d'), card('5d')], allIn: true };
        return { ...player, chips: 0, holeCards: [card('7h'), card('8h')], folded: true };
      }),
      contributions: { a: 2, b: 2, c: 1 },
      pots: [],
    };

    const result = advanceStreet(state);

    expect(winnerAmount(result, 'a')).toBe(2);
    expect(winnerAmount(result, 'b')).toBe(3);
    expect(winnerAmount(result, 'c')).toBe(0);
  });

  it('reports legal action ranges for the UI', () => {
    const state = startHand(createGame(config, players(), 'legal-actions'));
    const legal = legalActions(state, 'a');

    expect(legal.actions).toEqual(expect.arrayContaining(['fold', 'call', 'raise', 'allin']));
    expect(legal.toCall).toBe(10);
    expect(legal.minRaiseTo).toBe(20);
    expect(legal.maxRaiseTo).toBe(100);
  });
});

describe('antes', () => {
  const seats = [
    { id: 'a', name: 'A', chips: 1000, seatIndex: 0 },
    { id: 'b', name: 'B', chips: 1000, seatIndex: 1 },
    { id: 'c', name: 'C', chips: 1000, seatIndex: 2 },
  ];
  const config = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };

  it('takes an ante from everyone dealt in, on top of the blinds', () => {
    const anted = startHand(createGame({ ...config, ante: 2 }, seats, 5));
    const plain = startHand(createGame(config, seats, 5));
    const potOf = (s: GameState) => s.pots.reduce((sum, p) => sum + p.amount, 0);
    // Three players at 2 each is 6 more than the same hand without antes.
    expect(potOf(anted) - potOf(plain)).toBe(6);
    for (const player of anted.players) {
      expect(anted.contributions[player.id]).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not make the ante part of the bet to call', () => {
    const anted = startHand(createGame({ ...config, ante: 2 }, seats, 5));
    const plain = startHand(createGame(config, seats, 5));
    // An ante is dead money, so the price of playing is still one big blind.
    expect(anted.currentBet).toBe(plain.currentBet);
    const actor = anted.players[anted.currentPlayerIndex]!;
    expect(legalActions(anted, actor.id).toCall).toBe(legalActions(plain, plain.players[plain.currentPlayerIndex]!.id).toCall);
  });

  it('leaves the blinds themselves unchanged', () => {
    const anted = startHand(createGame({ ...config, ante: 2 }, seats, 5));
    const posted = anted.players.filter((p) => p.currentBet > 0).map((p) => p.currentBet).sort((x, y) => x - y);
    expect(posted).toEqual([5, 10]);
  });

  it('is off by default, so existing games are untouched', () => {
    const withZero = startHand(createGame({ ...config, ante: 0 }, seats, 5));
    const without = startHand(createGame(config, seats, 5));
    expect(withZero.contributions).toEqual(without.contributions);
  });

  it('takes only what a short stack has and puts them all in', () => {
    const short = [{ id: 'a', name: 'A', chips: 1, seatIndex: 0 }, ...seats.slice(1)];
    const anted = startHand(createGame({ ...config, ante: 50 }, short, 5));
    const a = anted.players.find((p) => p.id === 'a')!;
    expect(a.chips).toBe(0);
    expect(a.allIn).toBe(true);
    expect(anted.contributions.a).toBe(1);
  });

  it('rejects a negative ante rather than quietly paying one out', () => {
    expect(() => createGame({ ...config, ante: -5 }, seats, 5)).toThrow();
  });
});
