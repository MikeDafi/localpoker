import { describe, expect, it } from 'vitest';
import type { Card } from '../../engine';
import {
  displayHoleCards,
  exposeHoleCard,
  exposedCardsForPublicState,
  exposureFromPublicCards,
  hasExposedHoleCard,
  mergeHoleCardExposure,
  normalizeHoleCardExposure,
  type HoleCardExposure,
} from '../holeCardExposure';

const cards: [Card, Card] = [
  { rank: 14, suit: 's' },
  { rank: 7, suit: 'd' },
];

describe('hole card exposure', () => {
  it('tracks left and right cards independently', () => {
    const left = exposeHoleCard([false, false], 0);
    expect(left).toEqual([true, false]);
    expect(exposeHoleCard(left, 1)).toEqual([true, true]);
  });

  it('normalizes the RTDB object shape and ignores forged values', () => {
    expect(normalizeHoleCardExposure({ 0: true, 1: false, other: true })).toEqual([true, false]);
    expect(normalizeHoleCardExposure({ 0: 'true', 1: true })).toEqual([false, true]);
    expect(normalizeHoleCardExposure(null)).toEqual([false, false]);
  });

  it('merges optimistic local exposure with the published table copy', () => {
    expect(mergeHoleCardExposure([true, false], [false, true])).toEqual([true, true]);
  });

  it('publishes only the exposed cards, preserving their slots', () => {
    const exposed = exposedCardsForPublicState(cards, [false, true]);
    expect(exposed).toEqual({ 1: cards[1] });
    expect(JSON.stringify(exposed)).not.toContain(JSON.stringify(cards[0]));
  });

  it('does not publish a partial hand when no valid card occupies that slot', () => {
    expect(exposedCardsForPublicState([cards[0]], [false, true])).toBeUndefined();
  });

  it('keeps unknown cards face down when building render slots', () => {
    const exposed = exposedCardsForPublicState(cards, [true, false]);
    expect(displayHoleCards([], exposed)).toEqual([cards[0], null]);
    expect(exposureFromPublicCards(exposed)).toEqual([true, false]);
    expect(hasExposedHoleCard(exposureFromPublicCards(exposed))).toBe(true);
  });

  it('lets private cards win over stale public exposure in render slots', () => {
    const newer: [Card, Card] = [
      { rank: 2, suit: 'c' },
      { rank: 3, suit: 'h' },
    ];
    expect(displayHoleCards(newer, exposedCardsForPublicState(cards, [true, true]))).toEqual(newer);
  });

  it('accepts tuple state from local UI code', () => {
    const exposure: HoleCardExposure = [false, true];
    expect(normalizeHoleCardExposure(exposure)).toEqual(exposure);
  });
});
