import { describe, expect, it } from 'vitest';
import { decideAction, setBotEntropy, type Difficulty } from '../bot';
import { evaluateHand, HandCategory } from '../handEvaluator';
import { applyAction, createGame, legalActions, startHand } from '../holdem';
import type { BotDecision, GameConfig, GameState } from '../types';

/**
 * Behaviour tests for the expert bot, played through real hands.
 *
 * Each one pins a weakness the old expert had against a sound opponent. Where
 * a control is needed it is `easy`: every level now reads the betting, and
 * easy trusts its reads so little (0.2) that it plays close to what equity
 * against random cards says, which is exactly what the old expert did. Hard
 * used to be the control, until it learned to read too.
 */

const config: GameConfig = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };
const HERO = 'HERO';
const BOT = 'BOT';

function headsUp(seed: number, cfg: GameConfig = config): GameState {
  return startHand(
    createGame(cfg, [
      { id: HERO, name: 'Hero', seatIndex: 0 },
      { id: BOT, name: 'Bot', seatIndex: 1, isBot: true },
    ], seed),
  );
}

function potOf(state: GameState): number {
  return state.pots.reduce((sum, p) => sum + p.amount, 0);
}

function apply(state: GameState, id: string, decision: BotDecision): GameState {
  const result = applyAction(state, id, decision.action, decision.amount);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/**
 * The hero bets half pot on the flop, two thirds on the turn and twice the pot
 * on the river. The bot is made to call the first two so it reaches the river
 * with a wide range, then decides for itself. Returns the fold rate with one
 * pair that uses a hole card, the textbook bluff-catcher.
 */
function foldsToRiverOverbet(difficulty: Difficulty, hands: number): { pairFolds: number; folds: number } {
  let pairs = 0;
  let pairFolds = 0;
  let spots = 0;
  let folds = 0;

  for (let h = 0; h < hands; h += 1) {
    let state = headsUp(80_000 + h);
    for (let i = 0; i < 100 && state.street !== 'showdown'; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      const legal = legalActions(state, actor.id);
      if (actor.id === BOT && state.street === 'river' && legal.toCall > 0) {
        const decision = decideAction(state, BOT, difficulty);
        const hand = evaluateHand([...actor.holeCards, ...state.board]);
        const boardHand = evaluateHand(state.board);
        spots += 1;
        if (decision.action === 'fold') folds += 1;
        if (hand.category === HandCategory.Pair && boardHand.category === HandCategory.HighCard) {
          pairs += 1;
          if (decision.action === 'fold') pairFolds += 1;
        }
        break;
      }
      if (actor.id === HERO && state.street !== 'preflop' && legal.actions.includes('bet')) {
        const fraction = state.street === 'flop' ? 0.5 : state.street === 'turn' ? 0.66 : 2;
        const amount = Math.min(legal.maxBet ?? 0, Math.max(legal.minBet ?? 0, Math.round(potOf(state) * fraction)));
        state = apply(state, HERO, { action: 'bet', amount });
      } else {
        state = apply(state, actor.id, { action: legal.toCall > 0 ? 'call' : 'check' });
      }
    }
  }
  return { pairFolds: pairs === 0 ? 0 : pairFolds / pairs, folds: spots === 0 ? 0 : folds / spots };
}

describe('expert: big bets narrow the range', () => {
  it('folds one pair to a three-barrel river overbet far more often than random-hand equity does', () => {
    setBotEntropy('test:overbet');
    const expert = foldsToRiverOverbet('expert', 150);
    const control = foldsToRiverOverbet('easy', 150);

    // Measured over 300 hands: random-hand equity (the old hard) folded ~40%
    // of these pairs, expert ~67%; easy, the control now, folds a few percent.
    // Against random cards top pair looks like a 70% favourite; against a
    // balanced 2x pot range it is a bluff-catcher that beats only the 40% that
    // are bluffs.
    expect(expert.pairFolds).toBeGreaterThan(control.pairFolds + 0.15);
    // ...but it still calls with the top of its range, or overbetting every
    // river would be free.
    expect(expert.folds).toBeLessThan(0.95);
  }, 120_000);
});

describe('expert: minimum defence against small bets', () => {
  /**
   * The hero calls preflop and stabs a third of the pot on every flop. MDF
   * against a third-pot bet is 75%: fold more than a quarter of the time and
   * the stab profits with any two cards.
   */
  it('defends a third-pot flop stab at roughly MDF', () => {
    setBotEntropy('test:mdf');
    let spots = 0;
    let defended = 0;

    for (let h = 0; h < 200; h += 1) {
      let state = headsUp(90_000 + h);
      for (let i = 0; i < 100 && state.street !== 'showdown' && state.street !== 'turn'; i += 1) {
        const actor = state.players[state.currentPlayerIndex];
        const legal = legalActions(state, actor.id);
        if (actor.id === HERO) {
          if (state.street === 'flop' && legal.actions.includes('bet')) {
            state = apply(state, HERO, { action: 'bet', amount: Math.max(legal.minBet ?? 0, Math.round(potOf(state) / 3)) });
          } else if (state.street === 'preflop') {
            state = apply(state, HERO, { action: legal.toCall > 0 ? 'call' : 'check' });
          } else {
            break;
          }
          continue;
        }
        let decision = decideAction(state, BOT, 'expert');
        if (state.street === 'flop' && legal.toCall > 0) {
          spots += 1;
          if (decision.action !== 'fold') defended += 1;
          break;
        }
        // Check the flop to the hero so every hand reaches the stab.
        if (state.street === 'flop') decision = { action: 'check' };
        state = apply(state, BOT, decision);
      }
    }

    expect(spots).toBeGreaterThan(150);
    // Measured ~86%: a little over MDF, which is cheap against a bet this small.
    expect(defended / spots).toBeGreaterThan(0.68);
  }, 120_000);
});

describe('expert: short-stack push/fold', () => {
  /**
   * Six-handed at 8bb, everyone folds to one seat and it decides. Seat 0 is the
   * dealer and seat 3 is under the gun, so `folds` before the decision picks
   * the position: 0 is UTG, 3 is the button.
   */
  function shoveRate(folds: number, hands: number): number {
    const short: GameConfig = { ...config, startingStack: 80 };
    let shoves = 0;
    for (let h = 0; h < hands; h += 1) {
      let state = startHand(
        createGame(short, [0, 1, 2, 3, 4, 5].map((i) => ({ id: `P${i}`, name: `P${i}`, seatIndex: i, isBot: true })), 120_000 + h),
      );
      for (let f = 0; f < folds; f += 1) state = apply(state, state.players[state.currentPlayerIndex].id, { action: 'fold' });
      const decision = decideAction(state, state.players[state.currentPlayerIndex].id, 'expert');
      if (decision.action === 'allin') shoves += 1;
      // Short-stacked, anything but all in or out gives up the fold equity.
      expect(['allin', 'fold', 'check']).toContain(decision.action);
    }
    return shoves / hands;
  }

  it('shoves wide on the button and tight under the gun', () => {
    setBotEntropy('test:pushfold');
    const utg = shoveRate(0, 300);
    const button = shoveRate(3, 300);
    // Chart: ~17% UTG and ~47% on the button at 8bb.
    expect(utg).toBeLessThan(0.25);
    expect(button).toBeGreaterThan(0.38);
    expect(button).toBeGreaterThan(utg + 0.15);
  }, 120_000);
});

describe('expert: always legal', () => {
  it('returns legal actions and conserves chips across deep and short tables', () => {
    setBotEntropy('test:legal');
    for (const stack of [1000, 120, 60]) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const cfg = { ...config, startingStack: stack };
        const players = Array.from({ length: 2 + (seed % 5) }, (_, i) => ({ id: `P${i}`, name: `P${i}`, seatIndex: i, isBot: true }));
        let state = startHand(createGame(cfg, players, 4_000 + seed));
        for (let step = 0; step < 200 && state.street !== 'showdown'; step += 1) {
          const id = state.players[state.currentPlayerIndex].id;
          const legal = legalActions(state, id);
          const decision = decideAction(state, id, 'expert');
          expect(legal.actions).toContain(decision.action);
          state = apply(state, id, decision);
        }
        expect(state.street).toBe('showdown');
        expect(state.players.reduce((sum, p) => sum + p.chips, 0)).toBe(stack * players.length);
      }
    }
  }, 120_000);
});
