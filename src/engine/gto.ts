import type { Card } from './cards';
import { balancedBluffShare } from './rangeEquity';
import { callShoveWidth, pushWidth } from './preflopRanges';

/**
 * Game-theory rules of thumb the expert bot acts on, as pure functions.
 *
 * None of this is a solver. Each function is a closed-form result that solvers
 * agree with closely enough to be worth playing: minimum defence frequency,
 * the balanced bluff ratio, texture-dependent bet sizing and Nash push/fold.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The share of hands each defender must continue with so that a pure bluff of
 * this size does not profit: minimum defence frequency, MDF.
 *
 * `pot` includes the bet being faced. The bettor risks `toCall` to win the rest,
 * so a bluff breaks even when everyone folds `toCall / pot` of the time. With
 * several defenders, each one folding at rate `f` lets the bluff through at
 * `f^n`, so each needs to defend `1 - alpha^(1/n)` rather than the full MDF.
 * Defending the whole MDF multiway would be calling far too wide.
 */
export function minimumDefense(toCall: number, pot: number, defenders: number): number {
  if (toCall <= 0 || pot <= 0) return 0;
  const alpha = clamp(toCall / pot, 0, 1);
  return 1 - alpha ** (1 / Math.max(1, defenders));
}

/**
 * How coordinated a board is, from 0 (A72 rainbow) to 1 (monotone and
 * connected). Wet boards give the hands behind lots of equity to realise, so
 * value bets there should be bigger; dry boards change little from street to
 * street, so a small bet does the same job for less risk.
 */
export function boardWetness(board: readonly Card[]): number {
  if (board.length < 3) return 0;
  let wet = 0;

  const suitCounts = new Map<string, number>();
  for (const card of board) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  const maxSuit = Math.max(...suitCounts.values());
  if (maxSuit >= 3) wet += 0.5;
  else if (maxSuit === 2) wet += 0.3;

  const ranks = [...new Set(board.map((c) => c.rank))].sort((a, b) => a - b);
  // Three distinct ranks inside any five-rank window means straights are live.
  for (let i = 0; i + 2 < ranks.length; i += 1) {
    if (ranks[i + 2] - ranks[i] <= 4) {
      wet += 0.4;
      break;
    }
  }
  // A paired board has fewer strong hands and fewer draws.
  if (ranks.length < board.length) wet -= 0.15;
  return clamp(wet, 0, 1);
}

/**
 * Bet size as a fraction of the pot, by street and texture.
 *
 * Mirrors what solvers settle on: a third of the pot on dry flops, two thirds
 * on wet ones, larger on the turn, and a polar river where the strongest hands
 * overbet. Bluffs must use the same sizes as value, otherwise the size alone
 * tells the opponent which one it is, so `polar` is chosen by a roll for
 * bluffs rather than by hand strength.
 */
export function betFraction(street: 'flop' | 'turn' | 'river', wetness: number, polar: boolean): number {
  if (street === 'flop') return 0.33 + 0.4 * clamp(wetness, 0, 1);
  if (street === 'turn') return 0.5 + 0.3 * clamp(wetness, 0, 1);
  return polar ? 1.25 : 0.7;
}

/**
 * Chance that a hand with no showdown value is bet as a bluff at this size.
 *
 * A balanced range bets bluffs and value in the ratio `b : 1 - b`, where `b`
 * is `balancedBluffShare`. The bot cannot see its own range, so it uses a
 * fixed model of one: about as many hands value-bet as have no showdown value
 * at all. Under that model the chance to bluff each air hand is `b / (1 - b)`,
 * which is 0.25 at a third of the pot and 0.5 at pot size. Bigger bets bluff
 * more because each bluff needs to work less often.
 *
 * Multiway the bluff has to get through every player, so it is divided by the
 * number of opponents.
 */
export function bluffFrequency(betFractionOfPot: number, opponents: number): number {
  const b = balancedBluffShare(betFractionOfPot);
  return clamp(b / (1 - b) / Math.max(1, opponents), 0, 0.9);
}

/**
 * Whether these hole cards block the hands that would call a river bluff: an
 * ace (the nut card in most suits and straights) or a card of the suit the
 * board has three of. Bluffing with blockers makes the bluff work more often
 * than its share of the range suggests.
 */
export function hasBlocker(holeCards: readonly Card[], board: readonly Card[]): boolean {
  if (holeCards.some((c) => c.rank === 14)) return true;
  const suitCounts = new Map<string, number>();
  for (const card of board) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  return holeCards.some((c) => (suitCounts.get(c.suit) ?? 0) >= 3);
}

export type PushFoldAction = 'shove' | 'call' | 'check' | 'fold';

export interface PushFoldSpot {
  /** Our starting-hand percentile, 0 best, see `preflopPercentile`. */
  percentile: number;
  /** Effective stack in big blinds. */
  effectiveBB: number;
  /** Players still to act after us this round. */
  behind: number;
  /**
   * What we face: nobody has raised yet, a raise that is not all in, or an
   * all-in we can only call or fold to.
   */
  facing: 'unopened' | 'raise' | 'shove';
  /** The aggressor's estimated width when facing a raise or shove. */
  raiserWidth: number;
  /** Whether we can check instead of folding (the big blind, unraised). */
  canCheck: boolean;
}

/**
 * Short-stack preflop strategy: shove or fold, from a Nash-style chart.
 *
 * Below about 12bb a standard raise commits a third of the stack and leaves
 * nothing to play with postflop, so the only real options are all in or out.
 * Shoving also wins the most from the one thing a short stack has, fold
 * equity, and it takes the opponent's postflop edge away entirely.
 *
 * Against a raise the bot re-shoves rather than calling, since a call leaves a
 * stack too small to fold later.
 */
export function pushFoldAction(spot: PushFoldSpot): PushFoldAction {
  const passive: PushFoldAction = spot.canCheck ? 'check' : 'fold';
  if (spot.facing === 'unopened') {
    return spot.percentile <= pushWidth(spot.effectiveBB, spot.behind) ? 'shove' : passive;
  }
  const width = callShoveWidth(spot.effectiveBB, spot.raiserWidth, spot.behind);
  if (spot.percentile > width) return passive;
  return spot.facing === 'shove' ? 'call' : 'shove';
}
