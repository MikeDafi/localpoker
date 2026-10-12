import { createDeck, type Card } from './cards';
import { chenScore } from './equity';

/**
 * Preflop ranges as "the top X% of starting hands", for the expert bot.
 *
 * Everything here speaks in percentiles of the 1326 starting combos: 0 is the
 * best hand, 1 the worst, and a range of width 0.2 is the best fifth of hands.
 * One scale serves three jobs: deciding what to open, deciding what to shove
 * short-stacked, and guessing what an opponent holds from what they did. Using
 * the same scale for all three is what keeps them consistent with each other:
 * the bot reads an under-the-gun shove as exactly as tight as it would shove
 * there itself.
 *
 * The widths are approximations of solver and Nash push/fold output rather
 * than exact charts. A 169-class chart would be more precise, but the bot only
 * ranks hands by Chen, and a precise chart over an imprecise ranking is false
 * precision. The figures that matter, and the sources they approximate, are
 * next to each table.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Sort key for a starting hand: Chen first, then a tie-break.
 *
 * Chen alone is far too coarse to rank by. A score of 5 covers 17.8% of all
 * hands, so a "top 30%" range would be a cliff that either takes every one of
 * them or none. Breaking ties by pair, then high card, then kicker, then
 * suitedness spreads them out in roughly the order a chart would.
 */
function handKey(holeCards: readonly Card[]): number {
  const [a, b] = holeCards;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  const pair = high === low ? 1 : 0;
  const suited = a.suit === b.suit ? 1 : 0;
  return chenScore(holeCards) * 100_000 + pair * 50_000 + high * 1_000 + low * 20 + suited * 5;
}

let percentileByKey: Map<number, number> | null = null;

/**
 * Built once, lazily: 1326 keys and a sort, a few hundred microseconds, and it
 * never changes, so there is no point recomputing it per decision.
 */
function percentileTable(): Map<number, number> {
  if (percentileByKey) return percentileByKey;
  const deck = createDeck();
  const counts = new Map<number, number>();
  for (let i = 0; i < deck.length; i += 1) {
    for (let j = i + 1; j < deck.length; j += 1) {
      const key = handKey([deck[i], deck[j]]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const keys = [...counts.keys()].sort((x, y) => y - x);
  const total = (deck.length * (deck.length - 1)) / 2;
  const table = new Map<number, number>();
  let better = 0;
  for (const key of keys) {
    const count = counts.get(key) ?? 0;
    // The midpoint of the hand's own band, so a range edge that falls inside a
    // band takes half of it rather than all or nothing.
    table.set(key, (better + count / 2) / total);
    better += count;
  }
  percentileByKey = table;
  return table;
}

/** Where a starting hand ranks among all 1326, from 0 (aces) to 1 (the worst). */
export function preflopPercentile(holeCards: readonly Card[]): number {
  if (holeCards.length !== 2) return 1;
  return percentileTable().get(handKey(holeCards)) ?? 1;
}

/**
 * Raise-first-in width by how many players are still to act behind the opener.
 *
 * Approximates six-max solver opening ranges: UTG ~15%, HJ ~20%, CO ~28%,
 * BTN ~45%, SB ~42%. Heads-up the button opens ~80% because it has position
 * on the only player left and the blinds are a big share of a two-player pot.
 * Seats further from the button than six-max has (a full ring) keep tightening.
 */
export function openWidth(behind: number, headsUp: boolean): number {
  if (headsUp) return 0.8;
  const table = [0.42, 0.42, 0.45, 0.28, 0.2, 0.15, 0.13, 0.11, 0.1];
  return table[clamp(Math.round(behind), 1, table.length - 1)];
}

/** Value three-bet width against an opener of the given width. */
export function threeBetWidth(openerWidth: number): number {
  // Solvers three-bet roughly the top fifth of the hands that continue, which
  // makes three-bets tighten automatically against early-position opens.
  return clamp(openerWidth * 0.22, 0.025, 0.18);
}

/**
 * Heads-up (small blind versus big blind) Nash shove width by effective stack.
 *
 * Read off the published Nash push charts: ~85% at 5bb, ~65% at 8bb, ~58% at
 * 10bb, ~45% at 15bb. Interpolated linearly between the anchors.
 */
const SHOVE_ANCHORS: readonly (readonly [number, number])[] = [
  [2, 1],
  [4, 0.9],
  [5, 0.85],
  [6, 0.76],
  [8, 0.65],
  [10, 0.58],
  [12, 0.52],
  [15, 0.45],
  [20, 0.36],
];

function headsUpShoveWidth(effectiveBB: number): number {
  const bb = clamp(effectiveBB, SHOVE_ANCHORS[0][0], SHOVE_ANCHORS[SHOVE_ANCHORS.length - 1][0]);
  for (let i = 1; i < SHOVE_ANCHORS.length; i += 1) {
    const [x1, y1] = SHOVE_ANCHORS[i];
    const [x0, y0] = SHOVE_ANCHORS[i - 1];
    if (bb <= x1) return y0 + ((bb - x0) / (x1 - x0)) * (y1 - y0);
  }
  return SHOVE_ANCHORS[SHOVE_ANCHORS.length - 1][1];
}

/**
 * Stack depth, in big blinds, at or below which expert plays push/fold.
 *
 * Nash push/fold is close to optimal up to about 12bb. Between 12 and 15 it
 * still breaks even but a small raise starts doing better, and above that a
 * shove risks far too much to win the blinds, so the deep-stack ranges take
 * over. The charts above go to 20bb only so a re-shove read stays sensible.
 */
export const PUSH_FOLD_MAX_BB = 12;

/**
 * Unopened shove width by stack depth and the number of players left to act.
 *
 * Every player behind is one more chance of running into a hand, so the range
 * shrinks geometrically with them. 0.72 per player reproduces the Nash charts'
 * shape: at 10bb ~58% from the small blind, ~42% on the button, ~22% from the
 * hijack and ~15% under the gun of a six-max table.
 */
export function pushWidth(effectiveBB: number, behind: number): number {
  const players = Math.max(1, Math.round(behind));
  return clamp(headsUpShoveWidth(effectiveBB) * 0.72 ** (players - 1), 0.02, 1);
}

/**
 * Width to call (or re-shove over) an all-in, given how wide the shover is.
 *
 * The caller needs equity, not fold equity, so the range is a fraction of the
 * shover's: Nash has the big blind call ~37% against a 58% shove at 10bb, a
 * ratio of ~0.64 that drifts up as stacks get shallower and the price better.
 * Each player still to act behind the caller can wake up with a hand, which
 * tightens it further.
 */
export function callShoveWidth(effectiveBB: number, shoverWidth: number, behind: number): number {
  const ratio = clamp(0.6 + 0.015 * (15 - effectiveBB), 0.6, 0.8);
  return clamp(shoverWidth * ratio * 0.8 ** Math.max(0, behind), 0.02, 1);
}
