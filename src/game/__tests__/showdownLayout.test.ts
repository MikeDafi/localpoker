import { describe, it, expect } from 'vitest';

import {
  CARD_ASPECT,
  MAX_REVEAL_ROWS,
  MIN_REVEAL_CARD,
  ROW_GAP,
  layoutRevealRows,
  selectShowdownHands,
  showdownLabel,
  lostAtShowdown,
} from '../showdownLayout';
import type { Card } from '../../engine/cards';

const card = (rank: number, suit: string): Card => ({ rank, suit } as Card);

const player = (id: string, cards: Card[]) => ({ id, name: id.toUpperCase(), holeCards: cards });

const winner = (playerId: string, label: string) => ({
  playerId,
  hand: { cards: [1, 2, 3, 4, 5] },
  label,
});

const pick = (
  winners: ReturnType<typeof winner>[],
  players: ReturnType<typeof player>[],
  localPlayerId = 'nobody',
  localCardsShown = false,
) =>
  selectShowdownHands(winners, players, {
    localPlayerId,
    localCardsShown,
    label: (w) => w.label,
  });

describe('selectShowdownHands', () => {
  const alice = player('alice', [card(14, 's'), card(13, 's')]);
  const bob = player('bob', [card(14, 'h'), card(13, 'h')]);

  it('lays out the one winner of an ordinary pot', () => {
    const hands = pick([winner('alice', 'Flush')], [alice, bob]);
    expect(hands).toHaveLength(1);
    expect(hands[0]!.playerId).toBe('alice');
    expect(hands[0]!.hole).toHaveLength(2);
  });

  it('lays out both hands of a split pot, which used to drop one', () => {
    const hands = pick([winner('alice', 'Straight'), winner('bob', 'Straight')], [alice, bob]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice', 'bob']);
  });

  it('skips a winner who took the pot without showing', () => {
    const folded = { playerId: 'bob', hand: null, label: '' };
    const hands = pick([winner('alice', 'Flush'), folded as never], [alice, bob]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice']);
  });

  it('skips a winner holding no cards, which the rules refuse to publish', () => {
    const busted = player('bob', []);
    const hands = pick([winner('alice', 'Flush'), winner('bob', 'Flush')], [alice, busted]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice']);
  });

  it('withholds the local hand until its owner tables it', () => {
    const hidden = pick([winner('alice', 'Flush')], [alice, bob], 'alice', false);
    expect(hidden).toHaveLength(0);
    const shown = pick([winner('alice', 'Flush')], [alice, bob], 'alice', true);
    expect(shown).toHaveLength(1);
  });

  it('still shows the other half of a split the local player is in', () => {
    const hands = pick(
      [winner('alice', 'Straight'), winner('bob', 'Straight')],
      [alice, bob],
      'alice',
      false,
    );
    expect(hands.map((h) => h.playerId)).toEqual(['bob']);
  });

  it('caps the stack, so a four way split cannot shrink every card to nothing', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => player(id, [card(2, 's'), card(3, 's')]));
    const hands = pick(many.map((p) => winner(p.id, 'Two pair')), many);
    expect(hands).toHaveLength(MAX_REVEAL_ROWS);
  });
});

describe('layoutRevealRows', () => {
  const base = {
    columnX: [200, 260] as [number, number],
    boardCentreY: 150,
    preferredSize: 56,
    availableH: 200,
  };

  it('places nothing when there is nothing to show', () => {
    expect(layoutRevealRows({ ...base, count: 0, playerIds: [] })).toEqual([]);
  });

  it('leaves a single winner exactly where it has always landed', () => {
    const [row] = layoutRevealRows({ ...base, count: 1, playerIds: ['alice'] });
    expect(row!.size).toBe(base.preferredSize);
    expect(row!.targets.map((t) => t.x)).toEqual([200, 260]);
    expect(row!.targets[0]!.y).toBe(base.boardCentreY);
    expect(row!.targets[1]!.y).toBe(base.boardCentreY);
  });

  it('does not grow a single card beyond the size the board uses', () => {
    const [row] = layoutRevealRows({ ...base, count: 1, availableH: 10_000, playerIds: ['a'] });
    expect(row!.size).toBe(base.preferredSize);
  });

  it('stacks a tie vertically in the same two columns', () => {
    const rows = layoutRevealRows({ ...base, count: 2, playerIds: ['alice', 'bob'] });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.targets.map((t) => t.x)).toEqual([200, 260]);
      expect(row.targets[0]!.y).toBe(row.targets[1]!.y);
    }
    expect(rows[1]!.targets[0]!.y).toBeGreaterThan(rows[0]!.targets[0]!.y);
  });

  it('keeps the stack centred on the board row rather than drifting into the pot', () => {
    const rows = layoutRevealRows({ ...base, count: 2, playerIds: ['a', 'b'] });
    const mid = (rows[0]!.targets[0]!.y + rows[1]!.targets[0]!.y) / 2;
    expect(mid).toBeCloseTo(base.boardCentreY, 5);
  });

  it('separates the rows, so one hand never overlaps the other', () => {
    for (const count of [2, 3]) {
      const rows = layoutRevealRows({ ...base, count, playerIds: ['a', 'b', 'c'] });
      const rowH = rows[0]!.size * CARD_ASPECT;
      for (let i = 1; i < rows.length; i += 1) {
        const gap = rows[i]!.targets[0]!.y - rows[i - 1]!.targets[0]!.y - rowH;
        expect(gap).toBeGreaterThanOrEqual(ROW_GAP - 0.001);
      }
    }
  });

  it('fits the whole stack inside the room it was given', () => {
    for (const count of [1, 2, 3]) {
      const rows = layoutRevealRows({ ...base, count, playerIds: ['a', 'b', 'c'] });
      const rowH = rows[0]!.size * CARD_ASPECT;
      const top = rows[0]!.targets[0]!.y - rowH / 2;
      const bottom = rows[rows.length - 1]!.targets[0]!.y + rowH / 2;
      expect(top).toBeGreaterThanOrEqual(base.boardCentreY - base.availableH / 2 - 0.001);
      expect(bottom).toBeLessThanOrEqual(base.boardCentreY + base.availableH / 2 + 0.001);
    }
  });

  it('shrinks the cards when the extra hands no longer fit', () => {
    // The real lane is about one card row tall, so a second hand has to buy
    // its space from the first.
    const tight = { ...base, availableH: Math.round(base.preferredSize * CARD_ASPECT) };
    const one = layoutRevealRows({ ...tight, count: 1, playerIds: ['a'] })[0]!.size;
    const two = layoutRevealRows({ ...tight, count: 2, playerIds: ['a', 'b'] })[0]!.size;
    const three = layoutRevealRows({ ...tight, count: 3, playerIds: ['a', 'b', 'c'] })[0]!.size;
    expect(one).toBe(base.preferredSize);
    expect(two).toBeLessThan(one);
    expect(three).toBeLessThan(two);
  });

  it('does not shrink hands that already fit, since smaller helps nobody', () => {
    const roomy = layoutRevealRows({ ...base, count: 2, availableH: 400, playerIds: ['a', 'b'] });
    expect(roomy.every((r) => r.size === base.preferredSize)).toBe(true);
  });

  it('gives every hand the same size, so none looks like the real winner', () => {
    const rows = layoutRevealRows({ ...base, count: 3, playerIds: ['a', 'b', 'c'] });
    expect(new Set(rows.map((r) => r.size)).size).toBe(1);
  });

  it('stops shrinking at the point a card stops being readable', () => {
    const rows = layoutRevealRows({ ...base, count: 3, availableH: 40, playerIds: ['a', 'b', 'c'] });
    expect(rows.every((r) => r.size === MIN_REVEAL_CARD)).toBe(true);
  });

  it('never returns more rows than it will lay out', () => {
    const rows = layoutRevealRows({ ...base, count: 9, playerIds: ['a', 'b', 'c', 'd'] });
    expect(rows).toHaveLength(MAX_REVEAL_ROWS);
  });
});

describe('showdownLabel', () => {
  const hand = (playerId: string, label: string) => ({ playerId, name: playerId, hole: [], label });

  it('names the hand when one player wins', () => {
    expect(showdownLabel([hand('a', 'Flush')])).toBe('Flush');
  });

  it('says so when a pot is split on the same hand', () => {
    expect(showdownLabel([hand('a', 'Straight'), hand('b', 'Straight')])).toBe('Split pot \u00b7 Straight');
  });

  it('names both when the hands differ, which happens across side pots', () => {
    expect(showdownLabel([hand('a', 'Flush'), hand('b', 'Two pair')])).toBe('Split pot \u00b7 Flush / Two pair');
  });

  it('says nothing when nobody tabled a hand', () => {
    expect(showdownLabel([])).toBe('');
  });
});

describe('lostAtShowdown', () => {
  const held = [card(14, 's'), card(13, 's')];
  const beaten = { id: 'bob', holeCards: held };
  const won = [{ playerId: 'alice', amount: 300 }];

  it('marks a player whose hand was beaten', () => {
    expect(lostAtShowdown(beaten, won, { contested: true })).toBe(true);
  });

  it('does not mark the winner', () => {
    expect(lostAtShowdown({ id: 'alice', holeCards: held }, won, { contested: true })).toBe(false);
  });

  it('does not mark a player who folded, who never showed a hand to beat', () => {
    expect(lostAtShowdown({ ...beaten, folded: true }, won, { contested: true })).toBe(false);
  });

  it('does not mark a player sitting the hand out', () => {
    expect(lostAtShowdown({ ...beaten, sittingOut: true }, won, { contested: true })).toBe(false);
  });

  it('does not mark anyone when the pot was taken uncontested', () => {
    expect(lostAtShowdown(beaten, won, { contested: false })).toBe(false);
  });

  it('does not mark a player who took part of a split pot', () => {
    const split = [{ playerId: 'alice', amount: 150 }, { playerId: 'bob', amount: 150 }];
    expect(lostAtShowdown(beaten, split, { contested: true })).toBe(false);
  });

  it('does not mark a winner credited nothing, which is a side pot of zero', () => {
    const nothing = [{ playerId: 'bob', amount: 0 }, { playerId: 'alice', amount: 300 }];
    expect(lostAtShowdown(beaten, nothing, { contested: true })).toBe(true);
  });

  it('does not mark a player holding no cards at all', () => {
    expect(lostAtShowdown({ id: 'bob', holeCards: [] }, won, { contested: true })).toBe(false);
  });
});
