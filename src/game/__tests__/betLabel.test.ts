import { describe, expect, it } from 'vitest';
import { calledThisStreet } from '../betLabel';

const seat = (over: Partial<{ currentBet: number; hasActed: boolean; folded: boolean; allIn: boolean }>) => ({
  id: 'p', name: 'p', seatIndex: 0, chips: 1000, holeCards: [], folded: false, allIn: false,
  currentBet: 0, hasActed: false, isBot: false, sittingOut: false, ...over,
});

describe('calledThisStreet', () => {
  it('names a player who matched the raise a call', () => {
    const state = { street: 'flop' as const, currentBet: 200, lastAggressorIndex: 0,
      players: [seat({ currentBet: 200, hasActed: true }), seat({ currentBet: 200, hasActed: true })] };
    expect(calledThisStreet(state, 0)).toBe(false);
    expect(calledThisStreet(state, 1)).toBe(true);
  });

  it('leaves a posted blind and a short bet as amounts', () => {
    const state = { street: 'preflop' as const, currentBet: 100, lastAggressorIndex: 1,
      players: [seat({ currentBet: 50 }), seat({ currentBet: 100 }), seat({ currentBet: 100, hasActed: true })] };
    expect(calledThisStreet(state, 0)).toBe(false);
    expect(calledThisStreet(state, 1)).toBe(false);
    expect(calledThisStreet(state, 2)).toBe(true);
  });

  it('does not call a big blind checking its option a call', () => {
    const state = { street: 'preflop' as const, currentBet: 100, lastAggressorIndex: 1,
      players: [seat({ currentBet: 100, hasActed: true }), seat({ currentBet: 100, hasActed: true })] };
    expect(calledThisStreet(state, 1)).toBe(false);
  });

  it('does not call a short all-in that raised the price a call', () => {
    // A 15 shove into a 20 big blind on the flop is not aggression, so there
    // is no aggressor at all, but the shover set the price.
    const state = { street: 'flop' as const, currentBet: 15, lastAggressorIndex: null, priceSetterIndex: 0,
      players: [seat({ currentBet: 15, hasActed: true, allIn: true }), seat({ currentBet: 15, hasActed: true })] };
    expect(calledThisStreet(state, 0)).toBe(false);
    expect(calledThisStreet(state, 1)).toBe(true);
  });
});
