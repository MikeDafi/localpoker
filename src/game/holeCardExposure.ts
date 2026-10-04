import type { Card } from '../engine';

export type HoleCardIndex = 0 | 1;
export type HoleCardExposure = readonly [boolean, boolean];
export type PublicExposedHoleCards = Partial<Record<'0' | '1', Card>>;
export type MaybeHoleCard = Pick<Card, 'rank' | 'suit'> | null;

export const EMPTY_HOLE_CARD_EXPOSURE: HoleCardExposure = [false, false];

const cloneCard = (card: Card): Card => ({ rank: card.rank, suit: card.suit });

export function normalizeHoleCardExposure(value: unknown): HoleCardExposure {
  if (Array.isArray(value)) {
    return [value[0] === true, value[1] === true];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record[0] === true || record['0'] === true, record[1] === true || record['1'] === true];
  }
  return EMPTY_HOLE_CARD_EXPOSURE;
}

export function hasExposedHoleCard(exposure: HoleCardExposure): boolean {
  return exposure[0] || exposure[1];
}

export function exposeHoleCard(exposure: HoleCardExposure, index: HoleCardIndex): HoleCardExposure {
  return index === 0 ? [true, exposure[1]] : [exposure[0], true];
}

export function mergeHoleCardExposure(...exposures: readonly HoleCardExposure[]): HoleCardExposure {
  return exposures.reduce<HoleCardExposure>(
    (merged, exposure) => [merged[0] || exposure[0], merged[1] || exposure[1]],
    EMPTY_HOLE_CARD_EXPOSURE,
  );
}

export function exposedCardsForPublicState(
  cards: readonly Card[],
  exposure: HoleCardExposure,
): PublicExposedHoleCards | undefined {
  const exposed: PublicExposedHoleCards = {};
  if (exposure[0] && cards[0]) exposed['0'] = cloneCard(cards[0]);
  if (exposure[1] && cards[1]) exposed['1'] = cloneCard(cards[1]);
  return Object.keys(exposed).length > 0 ? exposed : undefined;
}

export function exposureFromPublicCards(cards: PublicExposedHoleCards | undefined): HoleCardExposure {
  return [!!cards?.['0'], !!cards?.['1']];
}

export function displayHoleCards(
  privateCards: readonly MaybeHoleCard[],
  exposedCards?: PublicExposedHoleCards,
): readonly [MaybeHoleCard, MaybeHoleCard] {
  return [
    privateCards[0] ?? exposedCards?.['0'] ?? null,
    privateCards[1] ?? exposedCards?.['1'] ?? null,
  ];
}
