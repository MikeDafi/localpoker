import { describe, expect, it } from 'vitest';
import { commitCeiling, decideAction, readTrust, setBotEntropy, stackRiskPremium, streetSpr, type Difficulty } from '../bot';
import { evaluateHand, HandCategory } from '../handEvaluator';
import { applyAction, createGame, legalActions, startHand } from '../holdem';
import { preflopPercentile } from '../preflopRanges';
import { boardComboTable, boardStrength, drawStrength } from '../rangeEquity';
import type { BotDecision, GameConfig, GameState } from '../types';

/**
 * Behaviour tests for what every level now shares with expert: reading the
 * betting, position-aware preflop ranges and stack-to-pot awareness, plus the
 * balanced sizing and bluff selection medium and hard took from it, and
 * expert's check-raise bluffs.
 *
 * Each is measured over seeded hands with a pinned bot secret, so the numbers
 * are deterministic; the bounds leave room for the figures in the comments to
 * move a little when unrelated tuning changes.
 */

const config: GameConfig = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };
const HERO = 'HERO';
const BOT = 'BOT';

function headsUp(seed: number, botFirst = false): GameState {
  const hero = { id: HERO, name: 'Hero', seatIndex: botFirst ? 1 : 0 };
  const bot = { id: BOT, name: 'Bot', seatIndex: botFirst ? 0 : 1, isBot: true };
  return startHand(createGame(config, botFirst ? [bot, hero] : [hero, bot], seed));
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
 * on the river, and the bot calls the first two so it reaches the river with
 * a wide range. Returns how often it folds one pair there.
 */
function pairFoldsToOverbet(difficulty: Difficulty, hands: number): number {
  let pairs = 0;
  let folds = 0;
  for (let h = 0; h < hands; h += 1) {
    let state = headsUp(80_000 + h);
    for (let i = 0; i < 100 && state.street !== 'showdown'; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      const legal = legalActions(state, actor.id);
      if (actor.id === BOT && state.street === 'river' && legal.toCall > 0) {
        const hand = evaluateHand([...actor.holeCards, ...state.board]);
        if (hand.category === HandCategory.Pair && evaluateHand(state.board).category === HandCategory.HighCard) {
          pairs += 1;
          if (decideAction(state, BOT, difficulty).action === 'fold') folds += 1;
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
  return folds / Math.max(1, pairs);
}

describe('every level reads the betting', () => {
  it('trusts reads more the higher the level', () => {
    expect(readTrust('easy')).toBeCloseTo(0.2, 5);
    expect(readTrust('medium')).toBeCloseTo(0.45, 5);
    expect(readTrust('hard')).toBeCloseTo(0.65, 5);
    expect(readTrust('expert')).toBeCloseTo(0.75, 5);
  });

  it('folds one pair to a three-barrel river overbet, more often the higher the level', () => {
    setBotEntropy('test:levels-overbet');
    const easy = pairFoldsToOverbet('easy', 150);
    const medium = pairFoldsToOverbet('medium', 150);
    const hard = pairFoldsToOverbet('hard', 150);

    // Measured: easy ~1%, medium ~10%, hard ~33%. Against random cards, which
    // is what every level but expert used to compare with, one pair looked
    // like a big favourite and hard folded it ~12% of the time.
    expect(hard).toBeGreaterThan(0.2);
    expect(hard).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThanOrEqual(easy);
    // Easy should still be the one a bluffer can't push off a hand.
    expect(easy).toBeLessThan(0.1);
  }, 120_000);

  /**
   * The bot opens heads-up and the hero three-bets to five times the open.
   * Medium used to call that with every hand it held, because against random
   * cards almost anything has the third of the pot the price asks for.
   */
  it('medium no longer calls a big three-bet with any two cards', () => {
    setBotEntropy('test:levels-3bet');
    let worst = 0;
    let worstContinued = 0;
    let best = 0;
    let bestContinued = 0;
    for (let h = 0; h < 600; h += 1) {
      let state = headsUp(700_000 + h, true);
      if (state.players[state.currentPlayerIndex]?.id !== BOT) continue;
      const open = decideAction(state, BOT, 'medium');
      if (open.action !== 'raise') continue;
      state = apply(state, BOT, open);
      const legal = legalActions(state, HERO);
      if (!legal.actions.includes('raise')) continue;
      state = apply(state, HERO, { action: 'raise', amount: Math.min(legal.maxRaiseTo ?? 0, state.currentBet * 5) });
      const decision = decideAction(state, BOT, 'medium');
      const percentile = preflopPercentile(state.players.find((p) => p.id === BOT)!.holeCards);
      if (percentile > 0.5) {
        worst += 1;
        if (decision.action !== 'fold') worstContinued += 1;
      } else if (percentile < 0.1) {
        best += 1;
        if (decision.action !== 'fold') bestContinued += 1;
      }
    }
    expect(worst).toBeGreaterThan(100);
    // Measured ~59%, was 100%. Still loose, as a medium player is.
    expect(worstContinued / worst).toBeLessThan(0.75);
    expect(bestContinued / best).toBeGreaterThan(0.95);
  }, 120_000);
});

type Street = 'flop' | 'turn' | 'river';

/**
 * Plays heads-up against a hero who only checks and calls, and records every
 * postflop bet the bot makes with what it held.
 */
function postflopBets(difficulty: Difficulty, hands: number) {
  const sizes = { ahead: { flop: [], turn: [], river: [] }, behind: { flop: [], turn: [], river: [] } } as Record<
    'ahead' | 'behind',
    Record<Street, number[]>
  >;
  let middleSpots = 0;
  let middleBets = 0;
  let airSpots = 0;
  let airBets = 0;
  for (let h = 0; h < hands; h += 1) {
    let state = headsUp(900_000 + h);
    for (let i = 0; i < 200 && state.street !== 'showdown'; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      if (actor.id !== BOT) {
        const legal = legalActions(state, HERO);
        state = apply(state, HERO, { action: legal.toCall > 0 ? 'call' : 'check' });
        continue;
      }
      const legal = legalActions(state, BOT);
      const decision = decideAction(state, BOT, difficulty);
      if (state.street !== 'preflop' && legal.actions.includes('bet')) {
        const strength = boardStrength(actor.holeCards, state.board, boardComboTable(state.board));
        const draw = drawStrength(actor.holeCards, state.board);
        const bet = decision.action === 'bet';
        if (strength >= 0.45 && strength < 0.6 && draw === 0) {
          middleSpots += 1;
          if (bet) middleBets += 1;
        } else if (strength < 0.3 && draw === 0) {
          airSpots += 1;
          if (bet) airBets += 1;
        }
        if (bet) {
          const hero = state.players.find((p) => p.id === HERO)!;
          const board = [...state.board, ...state.deck].slice(0, 5);
          const mine = evaluateHand([...actor.holeCards, ...board]).score;
          const theirs = evaluateHand([...hero.holeCards, ...board]).score;
          sizes[mine >= theirs ? 'ahead' : 'behind'][state.street as Street].push((decision.amount ?? 0) / Math.max(1, potOf(state)));
        }
      }
      state = apply(state, BOT, decision);
    }
  }
  return {
    sizes,
    middleRate: middleBets / Math.max(1, middleSpots),
    airRate: airBets / Math.max(1, airSpots),
  };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('medium and hard bet like expert', () => {
  it.each(['medium', 'hard'] as const)('%s bets the same sizes ahead or behind, and bluffs air rather than medium hands', (difficulty) => {
    setBotEntropy('test:levels-bets');
    const bets = postflopBets(difficulty, 120);

    // Flop and turn sizes come from the texture alone, so a bet made with the
    // worse hand is the same size as one made with the better. They used to
    // be half the pot behind and three quarters ahead. The river is left out:
    // its overbet is polar by design, and how often a value hand is the nuts
    // is not something to pin here.
    for (const street of ['flop', 'turn'] as const) {
      expect(bets.sizes.behind[street].length).toBeGreaterThan(5);
      expect(Math.abs(mean(bets.sizes.ahead[street]) - mean(bets.sizes.behind[street]))).toBeLessThan(0.06);
    }

    // Air bets at a real rate, so a check is not a sign of a made hand...
    expect(bets.airRate).toBeGreaterThan(0.1);
    // ...and medium hands, which win at showdown often enough to want one,
    // bet less often than air does, since betting them only gets called by
    // better.
    expect(bets.middleRate).toBeLessThan(bets.airRate);
  }, 120_000);
});

/** Blinds of 10/20, so 2.5bb is a round 50 and survives wager rounding. */
const roundBlinds: GameConfig = { ...config, smallBlind: 10, bigBlind: 20, startingStack: 2000 };

/**
 * Every first-in preflop decision on a six-max table of bots, by seats left to
 * act. Each hand stops at the first open, since nothing after it is first in.
 */
function firstIn(difficulty: Difficulty, hands: number) {
  const byBehind = new Map<number, { spots: number; raises: number; plays: number }>();
  const sizes = new Set<number>();
  for (let h = 0; h < hands; h += 1) {
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `P${i}`, name: `P${i}`, seatIndex: i, isBot: true }));
    let state = startHand(createGame(roundBlinds, players, 60_000 + h));
    for (let i = 0; i < 4; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      const decision = decideAction(state, actor.id, difficulty);
      const behind = state.players.filter((p) => p.id !== actor.id && !p.folded && !p.hasActed).length;
      const row = byBehind.get(behind) ?? { spots: 0, raises: 0, plays: 0 };
      row.spots += 1;
      byBehind.set(behind, row);
      if (decision.action === 'fold') {
        state = apply(state, actor.id, decision);
        continue;
      }
      row.plays += 1;
      if (decision.action === 'raise') {
        row.raises += 1;
        sizes.add(decision.amount ?? 0);
      }
      break;
    }
  }
  return { byBehind, sizes };
}

describe('position-aware preflop ranges for every level', () => {
  it.each(['easy', 'medium', 'hard'] as const)('%s opens wider on the button than under the gun, for 2.5bb', (difficulty) => {
    setBotEntropy('test:levels-open');
    const { byBehind, sizes } = firstIn(difficulty, 300);
    const utg = byBehind.get(5)!;
    const button = byBehind.get(2)!;
    expect(button.spots).toBeGreaterThan(50);
    expect(button.plays / button.spots).toBeGreaterThan(utg.plays / utg.spots + 0.15);
    expect([...sizes]).toEqual([50]);
  }, 120_000);

  it('easy plays more hands than hard and raises fewer of them', () => {
    setBotEntropy('test:levels-loose');
    const total = (d: Difficulty) => {
      let spots = 0;
      let plays = 0;
      let raises = 0;
      for (const row of firstIn(d, 300).byBehind.values()) {
        spots += row.spots;
        plays += row.plays;
        raises += row.raises;
      }
      return { play: plays / spots, raiseShare: raises / Math.max(1, plays) };
    };
    const easy = total('easy');
    const medium = total('medium');
    const hard = total('hard');
    expect(easy.play).toBeGreaterThan(medium.play);
    expect(medium.play).toBeGreaterThan(hard.play);
    expect(easy.raiseShare).toBeLessThan(0.5);
    expect(hard.raiseShare).toBeGreaterThan(0.99);
  }, 120_000);

  it('adds a big blind to the open for every limper', () => {
    setBotEntropy('test:levels-limper');
    // Under the gun limps, then the next seat decides.
    let checked = 0;
    for (let h = 0; h < 300 && checked < 20; h += 1) {
      const players = Array.from({ length: 6 }, (_, i) => ({ id: `P${i}`, name: `P${i}`, seatIndex: i, isBot: true }));
      let state = startHand(createGame(roundBlinds, players, 61_000 + h));
      state = apply(state, state.players[state.currentPlayerIndex].id, { action: 'call' });
      const actor = state.players[state.currentPlayerIndex];
      const decision = decideAction(state, actor.id, 'hard');
      if (decision.action === 'raise') {
        expect(decision.amount).toBe(70);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  }, 120_000);
});

describe('stack-to-pot ratio', () => {
  it('commits more readily when shallow and less when deep', () => {
    const stack = 1000;
    for (const equity of [0.55, 0.65, 0.75]) {
      expect(commitCeiling(equity, stack, 1)).toBeGreaterThanOrEqual(commitCeiling(equity, stack, 4));
      expect(commitCeiling(equity, stack, 4)).toBeGreaterThanOrEqual(commitCeiling(equity, stack, 10));
    }
    // A hand worth a third of the stack at a neutral depth is worth all of it
    // with only a pot behind, and a sixth of it at a deep one.
    expect(commitCeiling(0.75, stack, 1)).toBe(stack);
    expect(commitCeiling(0.65, stack, 10)).toBe(150);
    // The neutral depth is what it was before SPR was considered.
    expect(commitCeiling(0.75, stack)).toBe(600);
  });

  it('demands more to stack off deep, and more again with one pair', () => {
    const shallow = stackRiskPremium(800, 1000, 1);
    const neutral = stackRiskPremium(800, 1000, 4);
    const deep = stackRiskPremium(800, 1000, 10);
    const deepPair = stackRiskPremium(800, 1000, 10, true);
    expect(shallow).toBeLessThan(neutral);
    expect(deep).toBeGreaterThan(neutral);
    expect(deepPair).toBeGreaterThan(deep + 0.03);
    // Shallow, one pair is not penalised: it is what a short stack gets in with.
    expect(stackRiskPremium(800, 1000, 1, true)).toBe(shallow);
  });

  it('measures the ratio from the start of the street', () => {
    let state = headsUp(5);
    // Limp and check to the flop: 990-chip stacks behind a 20-chip pot.
    while (state.street === 'preflop') {
      const actor = state.players[state.currentPlayerIndex];
      state = apply(state, actor.id, { action: legalActions(state, actor.id).toCall > 0 ? 'call' : 'check' });
    }
    const me = state.players[state.currentPlayerIndex];
    const them = state.players.find((p) => p.id !== me.id)!;
    expect(streetSpr(state, me, [them])).toBeCloseTo(990 / 20, 5);
    // A bet on this street does not shrink it, or every big bet would look
    // like a shallow pot.
    state = apply(state, me.id, { action: 'bet', amount: 400 });
    const next = state.players[state.currentPlayerIndex];
    expect(streetSpr(state, next, [state.players.find((p) => p.id !== next.id)!])).toBeCloseTo(990 / 20, 5);
  });
});

describe('expert check-raises with bluffs as well as value', () => {
  /**
   * Limped pot, the bot checks the flop, the hero bets half the pot. A
   * check-raise used to be value plus the odd open-ended or flush draw, at a
   * smaller size than the value raise, so the size alone said which it was.
   *
   * Every strong hand checks here (the check is forced), so this measures
   * which hands raise and at what size, not the balance of the whole
   * checking range; `scripts/bot-bluff-share.mts`-style play measures that
   * (about 30% of expert's check-raises are now made with the worse hand,
   * against ~22% before, and a balanced range at this size is ~31%).
   */
  it('raises draws, including gutshots, at the same size as value', () => {
    setBotEntropy('test:levels-checkraise');
    let drawSpots = 0;
    let drawRaises = 0;
    let gutshotRaises = 0;
    let weakSpots = 0;
    let weakRaises = 0;
    const valueSizes: number[] = [];
    const bluffSizes: number[] = [];
    for (let h = 0; h < 400; h += 1) {
      let state = headsUp(400_000 + h);
      while (state.street === 'preflop') {
        const actor = state.players[state.currentPlayerIndex];
        state = apply(state, actor.id, { action: legalActions(state, actor.id).toCall > 0 ? 'call' : 'check' });
      }
      if (state.players[state.currentPlayerIndex].id !== BOT) continue;
      state = apply(state, BOT, { action: 'check' });
      const legal = legalActions(state, HERO);
      state = apply(state, HERO, { action: 'bet', amount: Math.max(legal.minBet ?? 0, Math.round(potOf(state) / 2)) });

      const bot = state.players.find((p) => p.id === BOT)!;
      const decision = decideAction(state, BOT, 'expert');
      const raised = decision.action === 'raise';
      const size = ((decision.amount ?? 0) - state.currentBet) / potOf(state);
      const strength = boardStrength(bot.holeCards, state.board, boardComboTable(state.board));
      const draw = drawStrength(bot.holeCards, state.board);
      const made = evaluateHand([...bot.holeCards, ...state.board]).category;
      if (draw > 0 && made <= HandCategory.Pair) {
        drawSpots += 1;
        if (raised) {
          drawRaises += 1;
          if (draw < 0.6) gutshotRaises += 1;
          bluffSizes.push(size);
        }
      } else if (strength < 0.3) {
        weakSpots += 1;
        if (raised) weakRaises += 1;
      } else if (raised && made >= HandCategory.TwoPair) {
        valueSizes.push(size);
      }
    }

    expect(drawSpots).toBeGreaterThan(40);
    expect(drawRaises / drawSpots).toBeGreaterThan(0.1);
    // Gutshots used to never raise.
    expect(gutshotRaises).toBeGreaterThan(0);
    // Flop air with no draw has nothing to fall back on and checks it down.
    expect(weakRaises / Math.max(1, weakSpots)).toBeLessThan(0.05);
    expect(valueSizes.length).toBeGreaterThan(5);
    expect(Math.abs(mean(valueSizes) - mean(bluffSizes))).toBeLessThan(0.05);
  }, 120_000);
});
