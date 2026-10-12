import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '../cards';
import { betFraction, bluffFrequency, boardWetness, hasBlocker, minimumDefense, pushFoldAction } from '../gto';
import { NO_READ, readHand } from '../handReads';
import { applyAction, createGame, startHand } from '../holdem';
import { callShoveWidth, openWidth, preflopPercentile, pushWidth, threeBetWidth } from '../preflopRanges';
import {
  balancedBluffShare,
  boardStrength,
  buildComboTable,
  comboWeights,
  drawStrength,
  rangeEquity,
  valueFraction,
} from '../rangeEquity';
import { monteCarloEquity } from '../equity';
import type { GameConfig } from '../types';

function c(text: string): Card {
  const rankChar = text[0];
  const ranks: Record<string, Rank> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  const rank = (ranks[rankChar] ?? Number(rankChar)) as Rank;
  return { rank, suit: text[1] as Suit };
}

function cards(text: string): Card[] {
  return text.split(' ').map(c);
}


describe('preflop ranges', () => {
  it('ranks starting hands on a 0 (best) to 1 (worst) scale', () => {
    expect(preflopPercentile(cards('As Ah'))).toBeLessThan(0.01);
    expect(preflopPercentile(cards('Ks Qs'))).toBeLessThan(0.1);
    expect(preflopPercentile(cards('7c 2d'))).toBeGreaterThan(0.95);
    // Suited beats offsuit, everything else equal.
    expect(preflopPercentile(cards('Js Ts'))).toBeLessThan(preflopPercentile(cards('Js Td')));
  });

  it('opens tighter the more players are left to act', () => {
    expect(openWidth(1, true)).toBeGreaterThan(0.7);
    const widths = [2, 3, 4, 5].map((behind) => openWidth(behind, false));
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]).toBeLessThan(widths[i - 1]);
    expect(widths[3]).toBeLessThan(0.2);
  });

  it('three-bets a fraction of what the opener raises', () => {
    expect(threeBetWidth(0.15)).toBeLessThan(threeBetWidth(0.45));
    expect(threeBetWidth(0.45)).toBeLessThan(0.15);
  });

  it('shoves wider when shorter and from later position, like the Nash charts', () => {
    // Heads-up anchors from the published charts.
    expect(pushWidth(10, 1)).toBeCloseTo(0.58, 2);
    expect(pushWidth(5, 1)).toBeCloseTo(0.85, 2);
    // Wider at 8bb than at 12bb.
    expect(pushWidth(8, 2)).toBeGreaterThan(pushWidth(12, 2));
    // Button (two behind) is wide, under the gun of six-max (five behind) tight.
    expect(pushWidth(8, 2)).toBeGreaterThan(0.4);
    expect(pushWidth(8, 5)).toBeLessThan(0.2);
  });

  it('calls a shove tighter than the shove range', () => {
    const shove = pushWidth(10, 1);
    const call = callShoveWidth(10, shove, 0);
    expect(call).toBeLessThan(shove);
    expect(call).toBeGreaterThan(0.3);
    // Players still to act behind the caller tighten it further.
    expect(callShoveWidth(10, shove, 2)).toBeLessThan(call);
  });
});

describe('push/fold chart', () => {
  const base = { effectiveBB: 8, raiserWidth: 1, canCheck: false } as const;

  it('shoves a middling hand on the button but not under the gun', () => {
    const k9o = preflopPercentile(cards('Kd 9c'));
    expect(pushFoldAction({ ...base, percentile: k9o, behind: 2, facing: 'unopened' })).toBe('shove');
    expect(pushFoldAction({ ...base, percentile: k9o, behind: 5, facing: 'unopened' })).toBe('fold');
  });

  it('checks the big blind rather than folding when it can', () => {
    expect(pushFoldAction({ ...base, percentile: 0.99, behind: 0, facing: 'unopened', canCheck: true })).toBe('check');
  });

  it('calls a shove only with a hand inside the calling range', () => {
    const shover = pushWidth(8, 1);
    expect(pushFoldAction({ ...base, percentile: preflopPercentile(cards('Ah Td')), behind: 0, facing: 'shove', raiserWidth: shover })).toBe('call');
    expect(pushFoldAction({ ...base, percentile: preflopPercentile(cards('8h 3d')), behind: 0, facing: 'shove', raiserWidth: shover })).toBe('fold');
    // Facing a raise that is not all in, a calling hand re-shoves.
    expect(pushFoldAction({ ...base, percentile: preflopPercentile(cards('Ah Td')), behind: 0, facing: 'raise', raiserWidth: shover })).toBe('shove');
  });
});

describe('GTO rules of thumb', () => {
  it('minimum defence: 75% against a third of the pot, 50% against pot', () => {
    // `pot` includes the bet being faced.
    expect(minimumDefense(10, 40, 1)).toBeCloseTo(0.75, 5);
    expect(minimumDefense(30, 60, 1)).toBeCloseTo(0.5, 5);
    // Multiway each defender carries less of it.
    expect(minimumDefense(10, 40, 2)).toBeLessThan(0.75);
    expect(minimumDefense(0, 40, 1)).toBe(0);
  });

  it('balanced bluff share grows with the bet size', () => {
    expect(balancedBluffShare(1 / 3)).toBeCloseTo(0.2, 5);
    expect(balancedBluffShare(1)).toBeCloseTo(1 / 3, 5);
    expect(balancedBluffShare(2)).toBeCloseTo(0.4, 5);
    expect(bluffFrequency(1, 1)).toBeGreaterThan(bluffFrequency(1 / 3, 1));
    expect(bluffFrequency(1, 3)).toBeLessThan(bluffFrequency(1, 1));
  });

  it('bets smaller on dry flops than wet ones, and polar on the river', () => {
    const dry = boardWetness(cards('Ad 7c 2h'));
    const wet = boardWetness(cards('9h Th Jd'));
    expect(dry).toBeLessThan(0.2);
    expect(wet).toBeGreaterThan(0.6);
    expect(betFraction('flop', dry, false)).toBeLessThan(0.4);
    expect(betFraction('flop', wet, false)).toBeGreaterThan(0.6);
    expect(betFraction('river', 0, true)).toBeGreaterThan(1);
  });

  it('knows an ace or a flush card is a river blocker', () => {
    expect(hasBlocker(cards('As 4d'), cards('Kh 9c 5d 3s 2h'))).toBe(true);
    expect(hasBlocker(cards('8h 4d'), cards('Kh 9h 5h 3s 2c'))).toBe(true);
    expect(hasBlocker(cards('8c 4d'), cards('Kh 9h 5h 3s 2c'))).toBe(false);
  });
});

describe('draws and board strength', () => {
  it('values draws that use a hole card', () => {
    expect(drawStrength(cards('Ah 5h'), cards('Kh 9h 2c'))).toBeGreaterThan(0.6);
    expect(drawStrength(cards('9c 8d'), cards('7h 6s 2c'))).toBeGreaterThan(0.55);
    expect(drawStrength(cards('9c 8d'), cards('Jh 7s 2c'))).toBeGreaterThan(0.3);
    expect(drawStrength(cards('2c 3d'), cards('Kh 9h 5h 4h'))).toBeGreaterThan(0);
    expect(drawStrength(cards('Ac Kd'), cards('7h 6s 2c'))).toBe(0);
    // Nothing left to draw to on the river.
    expect(drawStrength(cards('Ah 5h'), cards('Kh 9h 2c 3s 7d'))).toBe(0);
  });

  it('ranks the nuts at the top and air at the bottom', () => {
    const board = cards('Kh 9c 5d 3s 2h');
    const nuts = cards('4c Ad');
    const air = cards('7c 6d');
    expect(boardStrength(nuts, board, buildComboTable([...nuts, ...board], board))).toBeGreaterThan(0.95);
    expect(boardStrength(air, board, buildComboTable([...air, ...board], board))).toBeLessThan(0.2);
  });
});

describe('range-aware equity', () => {
  it('matches random-hand equity when nothing is known', () => {
    const hole = cards('Ah Kd');
    const board = cards('Kc 7s 2d');
    const table = buildComboTable([...hole, ...board], board);
    const ranged = rangeEquity(hole, board, table, [comboWeights(table, NO_READ)], 3000, 'eq:none');
    const random = monteCarloEquity(hole, board, 1, 3000, 'eq:random');
    expect(Math.abs(ranged - random)).toBeLessThan(0.04);
  });

  it('is deterministic for a given seed', () => {
    const hole = cards('Qs Qd');
    const table = buildComboTable(hole, []);
    const weights = [comboWeights(table, { ...NO_READ, preflopWidth: 0.05 })];
    expect(rangeEquity(hole, [], table, weights, 300, 'same')).toBe(rangeEquity(hole, [], table, weights, 300, 'same'));
  });

  it('drops against a three-bettor, as queens do against a tight range', () => {
    const hole = cards('Qs Qd');
    const table = buildComboTable(hole, []);
    const vsRandom = rangeEquity(hole, [], table, [comboWeights(table, NO_READ)], 2000, 'qq');
    const vsTight = rangeEquity(hole, [], table, [comboWeights(table, { ...NO_READ, preflopWidth: 0.03 })], 2000, 'qq');
    expect(vsRandom).toBeGreaterThan(0.75);
    expect(vsTight).toBeLessThan(0.65);
    expect(vsTight).toBeLessThan(vsRandom - 0.15);
  });

  it('top pair is a bluff-catcher, not a favourite, against a three-barrel overbet', () => {
    const hole = cards('Ks 2c');
    const board = cards('Jh 3s Kd Ad 9h');
    const table = buildComboTable([...hole, ...board], board);
    const read = { ...NO_READ, preflopWidth: 0.65, postflopAggression: 3, lastBetFraction: 2 };
    const ranged = rangeEquity(hole, board, table, [comboWeights(table, read)], 3000, 'river');
    const random = monteCarloEquity(hole, board, 1, 3000, 'river');
    expect(random).toBeGreaterThan(0.65);
    // A balanced 2x pot range is 40% bluffs, so a hand that beats only the
    // bluffs should sit close to that, and well under its random-hand figure.
    expect(ranged).toBeGreaterThan(0.3);
    expect(ranged).toBeLessThan(0.5);
  });

  it('weights an aggressive range towards strong hands', () => {
    const board = cards('Kh 9c 5d 3s 2h');
    const table = buildComboTable(board, board);
    const passive = comboWeights(table, NO_READ);
    const aggressive = comboWeights(table, { ...NO_READ, postflopAggression: 2, lastBetFraction: 1 });
    const meanStrength = (w: Float64Array): number => {
      let sum = 0;
      let total = 0;
      for (let k = 0; k < w.length; k += 1) {
        sum += w[k] * table.strength[k];
        total += w[k];
      }
      return sum / total;
    };
    expect(meanStrength(aggressive)).toBeGreaterThan(meanStrength(passive) + 0.15);
  });

  it('value fraction narrows with every barrel and with bet size', () => {
    expect(valueFraction(0, 0)).toBe(1);
    expect(valueFraction(2, 0.5)).toBeLessThan(valueFraction(1, 0.5));
    expect(valueFraction(3, 2)).toBeLessThan(valueFraction(3, 0.5));
  });
});

describe('reading the hand from the log', () => {
  const config: GameConfig = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };

  it('narrows openers and three-bettors, and counts postflop aggression', () => {
    const players = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, name: id, seatIndex: i }));
    // Dealer is seat 0 and the blinds seats 1 and 2, so seat 3 opens.
    let state = startHand(createGame(config, players, 7));
    const act = (id: string, action: 'fold' | 'call' | 'check' | 'bet' | 'raise', amount?: number): void => {
      const result = applyAction(state, id, action, amount);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    };
    const first = state.players[state.currentPlayerIndex].id;
    act(first, 'raise', 30);
    const second = state.players[state.currentPlayerIndex].id;
    act(second, 'raise', 90);
    // Everyone else folds, the opener calls.
    while (state.street === 'preflop') {
      const id = state.players[state.currentPlayerIndex].id;
      act(id, id === first ? 'call' : 'fold');
    }
    expect(state.street).toBe('flop');

    const preflop = readHand(state);
    expect(preflop.get(first)!.preflopWidth).toBeLessThan(0.5);
    expect(preflop.get(second)!.preflopWidth).toBeLessThan(preflop.get(first)!.preflopWidth);

    const toAct = state.players[state.currentPlayerIndex].id;
    act(toAct, 'bet', 100);
    const reads = readHand(state);
    // A half-pot bet is most of a full barrel.
    expect(reads.get(toAct)!.postflopAggression).toBeGreaterThan(0.6);
    expect(reads.get(toAct)!.postflopAggression).toBeLessThan(1);
    expect(reads.get(toAct)!.lastBetFraction).toBeGreaterThan(0.4);
    expect(reads.get(toAct)!.lastBetFraction).toBeLessThan(0.6);
  });

  it('gives no read for a hand with no actions', () => {
    const state = startHand(
      createGame(config, [{ id: 'A', name: 'A', seatIndex: 0 }, { id: 'B', name: 'B', seatIndex: 1 }], 3),
    );
    for (const read of readHand(state).values()) expect(read.preflopWidth).toBe(1);
  });
});
