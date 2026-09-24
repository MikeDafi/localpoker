import { createDeck, mulberry32, type Card, type Seed } from './cards';
import { compareHands, evaluateHand } from './handEvaluator';

/**
 * Hand-strength algorithms used by the bots.
 *
 * Both are published, freely usable methods rather than invented heuristics:
 *
 *  - **Chen formula** (Bill Chen, "The Mathematics of Poker") for preflop. A
 *    points system that is cheap to compute and well calibrated against real
 *    starting-hand rankings.
 *  - **Monte Carlo rollout equity** for postflop. Deal the opponents random
 *    hands, run the board out, and count how often we actually win at showdown.
 *    This is how equity calculators work, and unlike a made-hand lookup it
 *    values draws correctly, four to a flush on the turn is ~18% equity, not
 *    "high card".
 *
 * Everything is dependency-free and driven by the engine's seeded PRNG, so bot
 * behaviour stays deterministic and unit-testable.
 */

/** Chen points for one card: A=10, K=8, Q=7, J=6, else rank/2. */
function chenCardPoints(rank: number): number {
  if (rank === 14) return 10;
  if (rank === 13) return 8;
  if (rank === 12) return 7;
  if (rank === 11) return 6;
  return rank / 2;
}

/**
 * Bill Chen's starting-hand formula. Ranges from -1 (72o, the worst hand) to
 * 20 (AA).
 *
 * This is a *ranking*, not a probability, and must never be normalised to 0..1
 * and compared against pot odds: 72o scores -1 (bottom of the scale) but still
 * wins ~36% of the time heads-up. Doing that made every bot fold far too much
 * preflop. Use it to judge whether a hand is worth playing aggressively, and
 * `monteCarloEquity` for anything that needs a real win probability.
 */
export function chenScore(holeCards: readonly Card[]): number {
  if (holeCards.length !== 2) return 0;
  const [high, low] = [...holeCards].sort((a, b) => b.rank - a.rank);

  let score = chenCardPoints(high.rank);

  if (high.rank === low.rank) {
    // Pairs are worth double the card, with a floor of 5 (so 22 scores 5).
    score = Math.max(score * 2, 5);
  } else {
    if (high.suit === low.suit) score += 2;

    // Cards *between* the two: AK = 0, AQ = 1, AJ = 2, …
    const gap = high.rank - low.rank - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;

    // Straight bonus: connected or one-gap, both below Q.
    if (gap <= 1 && high.rank < 12) score += 1;
  }

  // Chen rounds half points up.
  return Math.ceil(score);
}

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/**
 * Win probability against `opponents` random hands, by simulation.
 *
 * Each trial deals every opponent two cards from the remaining deck, completes
 * the board to five, and compares showdown hands. Split pots count as a
 * fractional win, which is what makes this a true equity figure rather than a
 * raw win count.
 *
 * `sims` trades accuracy for CPU time; the caller scales it by difficulty. The
 * standard error is ~0.5/sqrt(sims), so 200 trials is ±3.5%, deliberately a
 * little noisy at low difficulties, which reads as an opponent who misjudges
 * their hand.
 */
export function monteCarloEquity(
  holeCards: readonly Card[],
  board: readonly Card[],
  opponents: number,
  sims: number,
  seed: Seed,
): number {
  if (holeCards.length !== 2) return 0;
  if (opponents <= 0) return 1;

  const known = new Set<string>([...holeCards, ...board].map(cardKey));
  const deck = createDeck().filter((c) => !known.has(cardKey(c)));
  const boardNeeded = 5 - board.length;
  const cardsNeeded = boardNeeded + opponents * 2;
  if (cardsNeeded > deck.length) return 0;

  const random = mulberry32(seed);
  let equity = 0;

  // Reused across trials; only the first `cardsNeeded` entries are shuffled.
  const pool = deck.slice();

  for (let trial = 0; trial < sims; trial += 1) {
    // Partial Fisher-Yates: draw exactly the cards this trial needs.
    for (let i = 0; i < cardsNeeded; i += 1) {
      const j = i + Math.floor(random() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    const runout = pool.slice(0, boardNeeded);
    const fullBoard = board.concat(runout);
    const mine = evaluateHand([...holeCards, ...fullBoard]);

    let best = 0; // 0 = we're ahead, 1 = tied, 2 = beaten
    let tied = 0;
    for (let o = 0; o < opponents; o += 1) {
      const at = boardNeeded + o * 2;
      const theirs = evaluateHand([pool[at], pool[at + 1], ...fullBoard]);
      const cmp = compareHands(mine, theirs);
      if (cmp < 0) {
        best = 2;
        break;
      }
      if (cmp === 0) {
        best = 1;
        tied += 1;
      }
    }

    if (best === 0) equity += 1;
    else if (best === 1) equity += 1 / (tied + 1);
  }

  return equity / sims;
}
