import { createDeck, mulberry32, type Card, type Seed } from './cards';
import { evaluateHand } from './handEvaluator';
import type { PlayerRead } from './handReads';
import { preflopPercentile } from './preflopRanges';

/**
 * Equity against what opponents are likely to hold, rather than any two cards.
 *
 * `monteCarloEquity` deals every opponent a uniformly random hand. That is the
 * right number before anyone has acted and the wrong one after: a top pair that
 * wins 75% against random cards wins far less against the range that just
 * overbet the river into it. This samples each opponent's hole cards from a
 * weighted distribution over every combo instead, weights built from what that
 * player did this hand (see `handReads.ts`).
 *
 * Weights rather than hard cut-offs, because a read is a probability, not a
 * fact. Every combo keeps a floor of weight, which is also what stands in for
 * the bluffs in a betting range.
 *
 * Cost: one evaluation per remaining combo to rank them on the board (1081 on
 * the flop), then the same per-trial work as `monteCarloEquity`. Sampling a
 * combo is a binary search over cumulative weights, so the trials themselves
 * are no slower. On the river the combo scores make the answer exact, so no
 * trials run at all.
 */

const DECK = createDeck();

function cardIndex(card: Card): number {
  const suit = card.suit === 'c' ? 0 : card.suit === 'd' ? 1 : card.suit === 'h' ? 2 : 3;
  return suit * 13 + (card.rank - 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Value of an unmade draw, on the same 0..1 scale as a made-hand percentile.
 *
 * Draws matter twice: they are most of the semi-bluffs in an aggressive range,
 * and they are hands that should continue against a small bet even though
 * they rank near the bottom by made strength alone. Only draws that use a hole
 * card count, since a draw on the board belongs to everyone.
 */
export function drawStrength(holeCards: readonly Card[], board: readonly Card[]): number {
  if (board.length < 3 || board.length >= 5) return 0;
  const cards = [...holeCards, ...board];

  let flushDraw = false;
  for (const suit of ['c', 'd', 'h', 's'] as const) {
    const count = cards.filter((c) => c.suit === suit).length;
    if (count === 4 && holeCards.some((c) => c.suit === suit)) flushDraw = true;
  }

  const ranks = new Set<number>(cards.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  const holeRanks = new Set<number>(holeCards.flatMap((c) => (c.rank === 14 ? [14, 1] : [c.rank])));
  let openEnded = false;
  let gutshot = false;
  for (let low = 1; low <= 10; low += 1) {
    const window = [low, low + 1, low + 2, low + 3, low + 4];
    const have = window.filter((r) => ranks.has(r));
    if (have.length !== 4 || !have.some((r) => holeRanks.has(r))) continue;
    // Four in a row with room at both ends is open-ended; anything else is a
    // single out rank.
    const missing = window.find((r) => !ranks.has(r));
    const run = missing === low ? low + 1 : low;
    if ((missing === low || missing === low + 4) && run > 1 && run + 3 < 14) openEnded = true;
    else gutshot = true;
  }

  if (flushDraw && (openEnded || gutshot)) return 0.85;
  if (flushDraw) return 0.72;
  if (openEnded) return 0.62;
  if (gutshot) return 0.42;
  return 0;
}

/** Every two-card combo not containing a known card, plus its board ranking. */
export interface ComboTable {
  first: Int8Array;
  second: Int8Array;
  /** Made-hand percentile on this board (0 worst, 1 best), raised to any draw's value. */
  strength: Float64Array;
  /** Preflop percentile (0 best, 1 worst). */
  preflop: Float64Array;
  /** Every combo's made-hand score on the board, in combo order. */
  scores: Float64Array;
  /** The same scores ascending, to rank our own hand. */
  sortedScores: Float64Array;
}

export function buildComboTable(known: readonly Card[], board: readonly Card[]): ComboTable {
  const used = new Uint8Array(52);
  for (const card of known) used[cardIndex(card)] = 1;
  const first: number[] = [];
  const second: number[] = [];
  for (let i = 0; i < 52; i += 1) {
    if (used[i]) continue;
    for (let j = i + 1; j < 52; j += 1) {
      if (used[j]) continue;
      first.push(i);
      second.push(j);
    }
  }

  const count = first.length;
  const strength = new Float64Array(count);
  const preflop = new Float64Array(count);
  const scores = new Float64Array(count);
  for (let k = 0; k < count; k += 1) {
    const hole = [DECK[first[k]], DECK[second[k]]];
    preflop[k] = preflopPercentile(hole);
    if (board.length >= 3) scores[k] = evaluateHand([...hole, ...board]).score;
  }

  const sorted = Float64Array.from(scores).sort();
  if (board.length >= 3) {
    for (let k = 0; k < count; k += 1) {
      const below = lowerBound(sorted, scores[k]);
      const ties = lowerBound(sorted, nextUp(scores[k])) - below;
      const made = (below + ties / 2) / count;
      const hole = [DECK[first[k]], DECK[second[k]]];
      strength[k] = Math.max(made, drawStrength(hole, board));
    }
  }

  return { first: Int8Array.from(first), second: Int8Array.from(second), strength, preflop, scores, sortedScores: sorted };
}

/**
 * The combo table for a board, built once per board and shared by every bot.
 *
 * Building a table is most of what a range-aware decision costs: an
 * evaluation of every remaining combo, and on the river each one is a 21-way
 * seven-card evaluation. Built per decision, as the expert first did, that is
 * paid again by every bot at the table and again each time the action comes
 * back round. Built from the board alone, one table serves the whole street;
 * each bot then removes the combos its own hole cards make impossible by
 * zeroing their weight, see `withoutCards`, and `boardStrength` and
 * `rangeEquity` skip them too.
 *
 * Ranking every combo on the board without regard to our own cards is also
 * how an opponent sees it, which is what the table's strengths are used for:
 * modelling what they would bet and call with.
 *
 * A handful of entries is enough: a table only ever plays one board at a
 * time, and the oldest is evicted first.
 */
const TABLE_CACHE_SIZE = 4;
const tableCache = new Map<string, ComboTable>();

export function boardComboTable(board: readonly Card[]): ComboTable {
  const key = board.map((c) => `${c.rank}${c.suit}`).join(',');
  const cached = tableCache.get(key);
  if (cached) return cached;
  const table = buildComboTable(board, board);
  tableCache.set(key, table);
  if (tableCache.size > TABLE_CACHE_SIZE) {
    const oldest = tableCache.keys().next().value;
    if (oldest !== undefined) tableCache.delete(oldest);
  }
  return table;
}

/** Zero the weight of every combo holding one of `cards`, in place, and return `weights`. */
export function withoutCards(weights: Float64Array, table: ComboTable, cards: readonly Card[]): Float64Array {
  const blocked = new Uint8Array(52);
  for (const card of cards) blocked[cardIndex(card)] = 1;
  for (let k = 0; k < weights.length; k += 1) {
    if (blocked[table.first[k]] || blocked[table.second[k]]) weights[k] = 0;
  }
  return weights;
}

function nextUp(score: number): number {
  // Scores are integers, so "strictly greater" is anything at or above +1.
  return score + 1;
}

function lowerBound(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Where our own hand ranks among every combo on this board, on the same scale.
 *
 * Combos holding one of our cards are left out, so a shared board table (see
 * `boardComboTable`) ranks exactly as one built without our cards would. A
 * linear pass over a thousand-odd scores costs nothing next to the one
 * evaluation it needs.
 */
export function boardStrength(holeCards: readonly Card[], board: readonly Card[], table: ComboTable): number {
  if (board.length < 3 || holeCards.length !== 2 || table.scores.length === 0) return 0;
  const mine = evaluateHand([...holeCards, ...board]).score;
  const a = cardIndex(holeCards[0]);
  const b = cardIndex(holeCards[1]);
  let below = 0;
  let ties = 0;
  let count = 0;
  for (let k = 0; k < table.scores.length; k += 1) {
    const x = table.first[k];
    const y = table.second[k];
    if (x === a || x === b || y === a || y === b) continue;
    count += 1;
    const s = table.scores[k];
    if (s < mine) below += 1;
    else if (s === mine) ties += 1;
  }
  if (count === 0) return 0;
  return Math.max((below + ties / 2) / count, drawStrength(holeCards, board));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * How much of a postflop betting range is value, by how many size-weighted
 * barrels the player has fired (see `PlayerRead.postflopAggression`) and how
 * big the latest one was.
 *
 * A single small c-bet is most of a range; each further barrel roughly halves
 * it, and an overbet is narrower still because only the top of a range wants to
 * put that much in. Solver river overbet ranges are around the top 8-10% of
 * combos on the board, which is where three barrels with a 2x pot overbet land.
 */
export function valueFraction(aggression: number, betFraction: number): number {
  if (aggression <= 0) return 1;
  const sizeTightening = 1 + 0.6 * Math.max(0, betFraction - 0.5);
  return clamp((0.5 * 0.55 ** (aggression - 1)) / sizeTightening, 0.04, 1);
}

/**
 * Share of a balanced betting range that is bluffs, for a bet of `betFraction`
 * times the pot: `bet / (pot + 2 * bet)`, the ratio that makes a bluff-catcher
 * indifferent to calling. 1/3 pot is 20% bluffs, pot is 33%, 2x pot is 40%.
 */
export function balancedBluffShare(betFraction: number): number {
  const f = Math.max(0, betFraction);
  return f / (1 + 2 * f);
}

/**
 * Sampling weight for every combo in `table`, for one opponent.
 *
 * Preflop: full weight inside their range, falling off over the next 6% of
 * hands to a small floor, since Chen is an imprecise ranking and players mix.
 *
 * Postflop aggression: a soft step at the top `valueFraction` of combos for
 * value, plus bluffs sized so they are exactly the balanced share of the
 * range. Modelling the bettor as balanced is the GTO assumption, and it is
 * what makes a pure bluff-catcher come out close to indifferent rather than an
 * automatic call or an automatic fold.
 *
 * Where the bluffs sit matters as much as how many there are. Spread evenly
 * below the value cut, a third of them would be hands like second pair that
 * beat nothing a bluff-catcher holds, and top pair came out at 22% equity
 * against a river overbet that is 40% bluffs. Real bluffs are the bottom of a
 * range (air and missed draws), so they go below `BLUFF_REGION`, and the
 * middle, which mostly checks, keeps only a fraction of that weight. Small
 * bets are made with merged ranges, so the middle is discounted less.
 *
 * Postflop calls: a caller rarely has nothing, so the bottom of the range is
 * discounted per call rather than removed.
 */
export function comboWeights(table: ComboTable, read: PlayerRead): Float64Array {
  const count = table.first.length;
  const weights = new Float64Array(count);
  const width = read.preflopWidth;
  for (let k = 0; k < count; k += 1) {
    const p = table.preflop[k];
    weights[k] = p <= width ? 1 : Math.max(0.01, 1 - (p - width) / 0.06);
  }

  if (read.postflopAggression > 0) {
    const cut = 1 - valueFraction(read.postflopAggression, read.lastBetFraction);
    const bluffShare = balancedBluffShare(read.lastBetFraction);
    const middle = clamp(1 - (read.lastBetFraction - 0.3) * 1.5, 0.15, 1);
    const bluffRegion = Math.min(BLUFF_REGION, cut);
    const valueShape = (s: number): number => sigmoid((s - cut) / 0.03);
    const bluffShape = (s: number): number => (s < bluffRegion ? 1 : middle) * (1 - valueShape(s));

    // Balance against the masses the preflop read actually leaves, not a
    // uniform board. A tight preflop range has fewer air hands at the bottom
    // and more strong ones at the top, and assuming otherwise left top pair
    // at 26% against a range meant to be 40% bluffs.
    let valueMass = 0;
    let bluffMass = 0;
    for (let k = 0; k < count; k += 1) {
      valueMass += weights[k] * valueShape(table.strength[k]);
      bluffMass += weights[k] * bluffShape(table.strength[k]);
    }
    const scale = bluffMass <= 0 ? 0 : clamp(((bluffShare / (1 - bluffShare)) * valueMass) / bluffMass, 0.02, 1);
    for (let k = 0; k < count; k += 1) {
      const s = table.strength[k];
      weights[k] *= valueShape(s) + scale * bluffShape(s);
    }
  }

  if (read.postflopCalls > 0) {
    for (let k = 0; k < count; k += 1) {
      weights[k] *= (0.35 + 0.65 * clamp((table.strength[k] - 0.25) / 0.4, 0, 1)) ** read.postflopCalls;
    }
  }
  return weights;
}

/** Board rank below which a betting hand is modelled as a bluff, see `comboWeights`. */
const BLUFF_REGION = 0.5;

/**
 * Mix a read with a uniform range: `trust` of the weight follows the read and
 * the rest is spread over every combo.
 *
 * The read models each opponent as balanced, which is the right assumption
 * against a strong player and a costly one against a reckless one. Trusted
 * fully, three small bets read as a near-nutted range, so the bot folded the
 * river to a player who bet 200 every street with any two cards, and that
 * player won. Keeping a share of "this action meant nothing" caps how far any
 * sequence of bets can talk the bot out of a hand, while still letting a real
 * overbet line push a bluff-catcher below the price.
 */
export function blendWithUniform(weights: Float64Array, trust: number): Float64Array {
  let total = 0;
  for (let k = 0; k < weights.length; k += 1) total += weights[k];
  if (total <= 0 || weights.length === 0) return weights;
  const t = clamp(trust, 0, 1);
  const uniform = ((1 - t) * total) / weights.length;
  const out = new Float64Array(weights.length);
  for (let k = 0; k < weights.length; k += 1) out[k] = t * weights[k] + uniform;
  return out;
}

/**
 * Where a hand of board strength `strength` sits inside a weighted range, from
 * 0 (the bottom) to 1 (the top).
 *
 * This is what minimum defence needs. MDF is a share of *our own range*, not
 * of all combos: by the river a player who has called twice holds mostly
 * pairs and better, and defending "the top 75% of every combo" from that range
 * would be defending almost all of it.
 */
export function rankInRange(table: ComboTable, weights: Float64Array, strength: number): number {
  let below = 0;
  let total = 0;
  for (let k = 0; k < weights.length; k += 1) {
    const w = weights[k];
    total += w;
    const s = table.strength[k];
    if (s < strength) below += w;
    else if (s === strength) below += w / 2;
  }
  return total <= 0 ? 0 : below / total;
}

function cumulative(weights: Float64Array): Float64Array {
  const out = new Float64Array(weights.length);
  let total = 0;
  for (let k = 0; k < weights.length; k += 1) {
    total += weights[k];
    out[k] = total;
  }
  return out;
}

/**
 * Win probability against opponents whose hands follow `weights`, by
 * simulation. One weights array per opponent, each over `table`'s combos.
 * Ties count as a share of the pot, as in `monteCarloEquity`.
 */
export function rangeEquity(
  holeCards: readonly Card[],
  board: readonly Card[],
  table: ComboTable,
  weights: readonly Float64Array[],
  sims: number,
  seed: Seed,
): number {
  if (holeCards.length !== 2) return 0;
  const opponents = weights.length;
  if (opponents === 0) return 1;

  const known = new Uint8Array(52);
  for (const card of [...holeCards, ...board]) known[cardIndex(card)] = 1;
  const pool: number[] = [];
  for (let i = 0; i < 52; i += 1) if (!known[i]) pool.push(i);
  const boardNeeded = 5 - board.length;
  if (boardNeeded + opponents * 2 > pool.length || table.first.length === 0) return 0;

  if (board.length === 5) return riverEquity(holeCards, board, table, weights);

  const cdfs = weights.map(cumulative);
  const random = mulberry32(seed);
  const used = new Uint8Array(52);
  // Our own cards start every trial taken, so a shared board table's combos
  // that hold them can never be dealt to an opponent even if their weight was
  // not zeroed. With a table built without our cards this changes nothing.
  const start = new Uint8Array(52);
  for (const card of holeCards) start[cardIndex(card)] = 1;
  const opponentCards: number[] = new Array<number>(opponents * 2);
  let equity = 0;

  for (let trial = 0; trial < sims; trial += 1) {
    used.set(start);

    for (let o = 0; o < opponents; o += 1) {
      const cdf = cdfs[o];
      const total = cdf[cdf.length - 1];
      let a = -1;
      let b = -1;
      // A sampled combo can collide with another opponent's cards. Retrying
      // keeps the distribution right; the cap keeps a pathological weighting
      // from looping, after which the combo is simply dealt at random.
      for (let attempt = 0; attempt < 12 && a < 0; attempt += 1) {
        const k = lowerBound(cdf, random() * total);
        const x = table.first[Math.min(k, cdf.length - 1)];
        const y = table.second[Math.min(k, cdf.length - 1)];
        if (!used[x] && !used[y]) {
          a = x;
          b = y;
        }
      }
      if (a < 0) {
        a = drawFree(pool, used, random);
        used[a] = 1;
        b = drawFree(pool, used, random);
      }
      used[a] = 1;
      used[b] = 1;
      opponentCards[o * 2] = a;
      opponentCards[o * 2 + 1] = b;
    }

    const fullBoard = board.slice();
    for (let r = 0; r < boardNeeded; r += 1) {
      const c = drawFree(pool, used, random);
      used[c] = 1;
      fullBoard.push(DECK[c]);
    }

    const mine = evaluateHand([...holeCards, ...fullBoard]).score;
    let beaten = false;
    let tied = 0;
    for (let o = 0; o < opponents; o += 1) {
      const theirs = evaluateHand([DECK[opponentCards[o * 2]], DECK[opponentCards[o * 2 + 1]], ...fullBoard]).score;
      if (theirs > mine) {
        beaten = true;
        break;
      }
      if (theirs === mine) tied += 1;
    }
    if (!beaten) equity += 1 / (tied + 1);
  }

  return equity / sims;
}

/**
 * River equity, exactly, from the scores the combo table already holds.
 *
 * With the board complete there is nothing left to simulate: each combo
 * either beats us, ties or loses, so a weighted sum is exact and needs no
 * trials. That makes the river, which needs the 1081 combo evaluations most,
 * no dearer than any other street. Several opponents are treated as
 * independent, which ignores their sharing a deck; the error is a fraction of
 * a percent, far below what the reads themselves are worth.
 */
function riverEquity(
  holeCards: readonly Card[],
  board: readonly Card[],
  table: ComboTable,
  weights: readonly Float64Array[],
): number {
  const mine = evaluateHand([...holeCards, ...board]).score;
  let equity = 1;
  for (const w of weights) {
    let won = 0;
    let total = 0;
    for (let k = 0; k < w.length; k += 1) {
      total += w[k];
      const theirs = table.scores[k];
      if (theirs < mine) won += w[k];
      else if (theirs === mine) won += w[k] / 2;
    }
    equity *= total <= 0 ? 1 : won / total;
  }
  return equity;
}

function drawFree(pool: readonly number[], used: Uint8Array, random: () => number): number {
  // Rejection is cheap: at most a dozen of the ~45 pool cards are ever taken.
  for (;;) {
    const c = pool[Math.floor(random() * pool.length)];
    if (!used[c]) return c;
  }
}
