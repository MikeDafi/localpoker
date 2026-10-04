import { describe, expect, it } from 'vitest';
import { botShowsHand, canMuck, showdownOrder, type ShowdownSeat } from '../showdownOrder';

const seat = (id: string, extra: Partial<ShowdownSeat> = {}): ShowdownSeat => ({
  id,
  holeCards: [{}, {}],
  ...extra,
});

/** Six seats, dealer on 0, so the first player left of the button is 'b'. */
const table = (): ShowdownSeat[] => ['a', 'b', 'c', 'd'].map((id) => seat(id));

describe('showdownOrder', () => {
  it('starts with the last aggressor when the river was bet', () => {
    const { order } = showdownOrder({
      players: table(),
      dealerIndex: 0,
      lastAggressorIndex: 2,
      winnerIds: [],
    });
    expect(order[0]).toBe('c');
    expect(order).toEqual(['c', 'd', 'a', 'b']);
  });

  it('starts left of the button when the river was checked through', () => {
    // Nobody made a claim, so nobody is on the hook to back one up.
    const { order } = showdownOrder({
      players: table(),
      dealerIndex: 0,
      lastAggressorIndex: null,
      winnerIds: [],
    });
    expect(order).toEqual(['b', 'c', 'd', 'a']);
  });

  it('skips players who folded', () => {
    const players = [seat('a'), seat('b', { folded: true }), seat('c'), seat('d', { folded: true })];
    const { order } = showdownOrder({
      players,
      dealerIndex: 0,
      lastAggressorIndex: null,
      winnerIds: [],
    });
    expect(order).toEqual(['c', 'a']);
  });

  it('falls back to the button order when the aggressor folded', () => {
    /*
     * Not impossible: bet the river, get raised, fold. The claim dies with the
     * fold, so there is nobody obliged to show first.
     */
    const players = [seat('a'), seat('b', { folded: true }), seat('c'), seat('d')];
    const { order } = showdownOrder({
      players,
      dealerIndex: 0,
      lastAggressorIndex: 1,
      winnerIds: [],
    });
    expect(order).toEqual(['c', 'd', 'a']);
  });

  it('ignores a seat sitting out or holding no cards', () => {
    const players = [seat('a'), seat('b', { sittingOut: true }), seat('c', { holeCards: [] }), seat('d')];
    const { order } = showdownOrder({
      players,
      dealerIndex: 0,
      lastAggressorIndex: null,
      winnerIds: [],
    });
    expect(order).toEqual(['d', 'a']);
  });

  it('includes every live hand exactly once', () => {
    const { order } = showdownOrder({
      players: table(),
      dealerIndex: 2,
      lastAggressorIndex: 3,
      winnerIds: [],
    });
    expect(new Set(order).size).toBe(order.length);
    expect(order).toHaveLength(4);
  });
});

describe('who is forced to show', () => {
  it('forces the first to act, because they made the claim', () => {
    const o = showdownOrder({ players: table(), dealerIndex: 0, lastAggressorIndex: 2, winnerIds: [] });
    expect(o.mustShow).toEqual(['c']);
    expect(canMuck(o, 'c')).toBe(false);
  });

  it('forces a winner, because a hand nobody saw cannot be paid', () => {
    const o = showdownOrder({ players: table(), dealerIndex: 0, lastAggressorIndex: 2, winnerIds: ['a'] });
    expect(o.mustShow).toEqual(expect.arrayContaining(['c', 'a']));
    expect(canMuck(o, 'a')).toBe(false);
  });

  it('lets everyone else throw their hand away', () => {
    const o = showdownOrder({ players: table(), dealerIndex: 0, lastAggressorIndex: 2, winnerIds: ['c'] });
    expect(canMuck(o, 'd')).toBe(true);
    expect(canMuck(o, 'b')).toBe(true);
  });

  it('does not let a folded player muck something they are not in', () => {
    const o = showdownOrder({ players: table(), dealerIndex: 0, lastAggressorIndex: null, winnerIds: [] });
    expect(canMuck(o, 'nobody')).toBe(false);
  });
});

describe('botShowsHand', () => {
  const o = showdownOrder({ players: table(), dealerIndex: 0, lastAggressorIndex: 2, winnerIds: ['a'] });

  it('shows when it has no choice', () => {
    expect(botShowsHand({ order: o, playerId: 'c', stillBest: false })).toBe(true);
    expect(botShowsHand({ order: o, playerId: 'a', stillBest: false })).toBe(true);
  });

  it('tables a hand that is still winning', () => {
    expect(botShowsHand({ order: o, playerId: 'd', stillBest: true })).toBe(true);
  });

  it('mucks a hand already beaten by something face up', () => {
    expect(botShowsHand({ order: o, playerId: 'd', stillBest: false })).toBe(false);
  });
});
