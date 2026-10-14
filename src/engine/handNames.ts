import { HandCategory } from './handEvaluator';

export const HAND_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Trips',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Quads',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

export function handName(cat: HandCategory): string {
  return HAND_NAMES[cat] ?? '';
}
