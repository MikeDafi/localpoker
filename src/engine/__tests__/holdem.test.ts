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
