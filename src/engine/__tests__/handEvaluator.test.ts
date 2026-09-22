import { describe, expect, it } from 'vitest';
import { formatCard, type Card, type Rank, type Suit } from '../cards';
import { compareHands, evaluateHand, handStrengthScore, HandCategory } from '../handEvaluator';

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
  const rankText = value.slice(0, -1);
  const suit = value.slice(-1) as Suit;
  return { rank: rankMap[rankText], suit };
}

function cards(...values: string[]): Card[] {
  return values.map(card);
}

describe('hand evaluator', () => {
  it.each([
    ['high card', cards('As', 'Kd', '9c', '5h', '2s'), HandCategory.HighCard, [14, 13, 9, 5, 2]],
    ['pair', cards('As', 'Ad', 'Kc', '8h', '2s'), HandCategory.Pair, [14, 13, 8, 2]],
    ['two pair', cards('As', 'Ad', 'Kc', 'Kh', '2s'), HandCategory.TwoPair, [14, 13, 2]],
    ['three of a kind', cards('As', 'Ad', 'Ac', 'Kd', '2s'), HandCategory.ThreeOfAKind, [14, 13, 2]],
    ['straight', cards('9s', '8d', '7c', '6h', '5s'), HandCategory.Straight, [9]],
    ['flush', cards('As', 'Ts', '8s', '4s', '2s'), HandCategory.Flush, [14, 10, 8, 4, 2]],
    ['full house', cards('As', 'Ad', 'Ac', 'Kd', 'Ks'), HandCategory.FullHouse, [14, 13]],
    ['four of a kind', cards('As', 'Ad', 'Ac', 'Ah', 'Ks'), HandCategory.FourOfAKind, [14, 13]],
    ['straight flush', cards('As', 'Ks', 'Qs', 'Js', 'Ts'), HandCategory.StraightFlush, [14]],
  ])('recognizes %s', (_name, hand, category, ranks) => {
    const evaluation = evaluateHand(hand);
    expect(evaluation.category).toBe(category);
    expect(evaluation.ranks).toEqual(ranks);
    expect(evaluation.cards).toHaveLength(5);
    expect(evaluation.score).toBe(handStrengthScore(evaluation));
  });

  it('handles the wheel straight with ace low', () => {
    const evaluation = evaluateHand(cards('As', '2d', '3c', '4h', '5s'));
    expect(evaluation.category).toBe(HandCategory.Straight);
    expect(evaluation.ranks).toEqual([5]);
    expect(evaluation.cards.map(formatCard)).toEqual(['5s', '4h', '3c', '2d', 'As']);
  });

  it('handles an ace-high straight', () => {
    const evaluation = evaluateHand(cards('As', 'Kd', 'Qc', 'Jh', 'Ts'));
    expect(evaluation.category).toBe(HandCategory.Straight);
    expect(evaluation.ranks).toEqual([14]);
  });

  it('orders flush above straight and full house above flush', () => {
    const flush = evaluateHand(cards('As', 'Js', '8s', '4s', '2s'));
    const straight = evaluateHand(cards('9c', '8d', '7h', '6s', '5c'));
    const fullHouse = evaluateHand(cards('Ah', 'Ad', 'Ac', 'Kd', 'Kc'));

    expect(compareHands(flush, straight)).toBeGreaterThan(0);
    expect(compareHands(fullHouse, flush)).toBeGreaterThan(0);
  });

  it('compares kickers and detects exact ties', () => {
    const betterPair = evaluateHand(cards('As', 'Ad', 'Kc', '8h', '2s'));
    const worsePair = evaluateHand(cards('Ah', 'Ac', 'Qc', '8d', '2d'));
    const tieA = evaluateHand(cards('As', 'Kd', '9c', '5h', '2s'));
    const tieB = evaluateHand(cards('Ac', 'Kh', '9d', '5s', '2d'));

    expect(compareHands(betterPair, worsePair)).toBeGreaterThan(0);
    expect(compareHands(tieA, tieB)).toBe(0);
  });

  it('selects the best five cards from seven', () => {
    const evaluation = evaluateHand(cards('As', 'Ks', 'Qs', 'Js', 'Ts', '2c', '2d'));
    expect(evaluation.category).toBe(HandCategory.StraightFlush);
    expect(evaluation.ranks).toEqual([14]);
    expect(evaluation.cards.map(formatCard)).toEqual(['As', 'Ks', 'Qs', 'Js', 'Ts']);
  });

  it('sorts by numeric strength score', () => {
    const hands = [
      evaluateHand(cards('As', 'Kd', '9c', '5h', '2s')),
      evaluateHand(cards('9s', '8d', '7c', '6h', '5s')),
      evaluateHand(cards('As', 'Ad', 'Ac', 'Ah', 'Ks')),
    ];
    const sorted = [...hands].sort((a, b) => handStrengthScore(a) - handStrengthScore(b));
    expect(sorted.map((hand) => hand.category)).toEqual([
      HandCategory.HighCard,
      HandCategory.Straight,
      HandCategory.FourOfAKind,
    ]);
  });
});
