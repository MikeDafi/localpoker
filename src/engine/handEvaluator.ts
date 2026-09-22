import type { Card, Rank } from './cards';

/**
 * Hand categories, ordered so a bigger number is a better hand.
 *
 * An object and a matching type rather than an `enum`, which reads the same at
 * every call site but is plain JavaScript once the types are stripped. `enum`
 * is the one TypeScript construct that emits a runtime value of its own, so it
 * cannot be erased: it stops the engine being importable by any tool that only
 * strips types, which includes Node's own TypeScript support and therefore the
 * analysis scripts that play the bot against itself.
 */
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const;

export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export interface HandEvaluation {
  category: HandCategory;
  ranks: number[];
  cards: Card[];
  score: number;
}

const SCORE_BASE = 15;
const RANKS_IN_SCORE = 5;

function cloneCards(cards: readonly Card[]): Card[] {
  return cards.map((card) => ({ ...card }));
}

function descendingRanks(cards: readonly Card[]): number[] {
  return cards.map((card) => card.rank).sort((a, b) => b - a);
}

function countRanks(cards: readonly Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function straightHighFromRanks(ranks: readonly number[]): number | null {
  const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);

  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i - 1] - unique[i] === 1) {
      run += 1;
      if (run >= 5) {
        return unique[i - 4] === 1 ? 5 : unique[i - 4];
      }
    } else {
      run = 1;
    }
  }

  return null;
}

function scoreEvaluation(category: HandCategory, ranks: readonly number[]): number {
  let score = category * SCORE_BASE ** RANKS_IN_SCORE;
  for (let i = 0; i < RANKS_IN_SCORE; i += 1) {
    score += (ranks[i] ?? 0) * SCORE_BASE ** (RANKS_IN_SCORE - i - 1);
  }
  return score;
}

function orderCardsForCategory(cards: readonly Card[], category: HandCategory, ranks: readonly number[]): Card[] {
  const byRankThenSuit = cloneCards(cards).sort((a, b) => b.rank - a.rank || b.suit.localeCompare(a.suit));

  if (category === HandCategory.Straight || category === HandCategory.StraightFlush) {
    const high = ranks[0];
    const straightRanks = high === 5 ? [5, 4, 3, 2, 14] : [high, high - 1, high - 2, high - 3, high - 4];
    return straightRanks
      .map((rank) => byRankThenSuit.find((card) => card.rank === rank))
      .filter((card): card is Card => Boolean(card));
  }

  const groupRankOrder = new Map<number, number>();
  ranks.forEach((rank, index) => groupRankOrder.set(rank, index));

  return byRankThenSuit.sort((a, b) => {
    const groupA = groupRankOrder.get(a.rank) ?? RANKS_IN_SCORE;
    const groupB = groupRankOrder.get(b.rank) ?? RANKS_IN_SCORE;
    return groupA - groupB || b.rank - a.rank || b.suit.localeCompare(a.suit);
  });
}

function evaluateFive(cards: readonly Card[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`evaluateFive requires exactly 5 cards, received ${cards.length}`);
  }

  const counts = countRanks(cards);
  const rankGroups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = straightHighFromRanks(cards.map((card) => card.rank));

  let category: HandCategory;
  let ranks: number[];

  if (isFlush && straightHigh !== null) {
    category = HandCategory.StraightFlush;
    ranks = [straightHigh];
  } else if (rankGroups[0].count === 4) {
    category = HandCategory.FourOfAKind;
    const kicker = rankGroups.find((group) => group.count === 1)?.rank;
    ranks = [rankGroups[0].rank, kicker ?? 0];
  } else if (rankGroups[0].count === 3 && rankGroups[1]?.count === 2) {
    category = HandCategory.FullHouse;
    ranks = [rankGroups[0].rank, rankGroups[1].rank];
  } else if (isFlush) {
    category = HandCategory.Flush;
    ranks = descendingRanks(cards);
  } else if (straightHigh !== null) {
    category = HandCategory.Straight;
    ranks = [straightHigh];
  } else if (rankGroups[0].count === 3) {
    category = HandCategory.ThreeOfAKind;
    const kickers = rankGroups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
    ranks = [rankGroups[0].rank, ...kickers];
  } else if (rankGroups[0].count === 2 && rankGroups[1]?.count === 2) {
    category = HandCategory.TwoPair;
    const pairs = rankGroups.filter((group) => group.count === 2).map((group) => group.rank).sort((a, b) => b - a);
    const kicker = rankGroups.find((group) => group.count === 1)?.rank;
    ranks = [...pairs, kicker ?? 0];
  } else if (rankGroups[0].count === 2) {
    category = HandCategory.Pair;
    const kickers = rankGroups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
    ranks = [rankGroups[0].rank, ...kickers];
  } else {
    category = HandCategory.HighCard;
    ranks = descendingRanks(cards);
  }

  const orderedCards = orderCardsForCategory(cards, category, ranks);
  return {
    category,
    ranks,
    cards: orderedCards,
    score: scoreEvaluation(category, ranks),
  };
}

function combinationsOfFive(cards: readonly Card[]): Card[][] {
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return combinations;
}

function assertValidCards(cards: readonly Card[]): void {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateHand requires 5, 6, or 7 cards, received ${cards.length}`);
  }

  const seen = new Set<string>();
  for (const card of cards) {
    if (card.rank < 2 || card.rank > 14) {
      throw new Error(`Invalid card rank: ${card.rank}`);
    }
    const key = `${card.rank}${card.suit}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate card: ${key}`);
    }
    seen.add(key);
  }
}

export function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.category !== b.category) return a.category - b.category;

  const length = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export function handStrengthScore(handOrCards: HandEvaluation | readonly Card[]): number {
  if ('score' in handOrCards) return handOrCards.score;
  return evaluateHand(handOrCards).score;
}

export function evaluateHand(cards: readonly Card[]): HandEvaluation {
  assertValidCards(cards);

  let best: HandEvaluation | null = null;
  for (const combination of combinationsOfFive(cards)) {
    const evaluation = evaluateFive(combination);
    if (best === null || compareHands(evaluation, best) > 0) {
      best = evaluation;
    }
  }

  if (!best) throw new Error('Unable to evaluate hand');
  return best;
}

export function isRank(value: number): value is Rank {
  return value >= 2 && value <= 14 && Number.isInteger(value);
}
