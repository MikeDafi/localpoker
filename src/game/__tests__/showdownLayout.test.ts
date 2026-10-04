import { describe, it, expect } from 'vitest';

import {
  CARD_ASPECT,
  CARD_GAP,
  MAX_REVEAL_HANDS,
  MIN_REVEAL_CARD,
  HAND_GAP,
  MIN_HAND_GAP,
  handGapFor,
  layoutRevealHands,
  feltWidthAt,
  fitBoardCard,
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
  contested = true,
) =>
  selectShowdownHands(winners, players, {
    localPlayerId,
    localCardsShown,
    label: (w) => w.label,
    contested,
  });

describe('selectShowdownHands', () => {
  const alice = player('alice', [card(14, 's'), card(13, 's')]);
  const bob = player('bob', [card(14, 'h'), card(13, 'h')]);

  it('lays out the winner and the hand it beat', () => {
    const hands = pick([winner('alice', 'Flush')], [alice, bob]);
    expect(hands.map((h) => [h.playerId, h.outcome])).toEqual([['alice', 'won'], ['bob', 'lost']]);
    expect(hands[0]!.hole).toHaveLength(2);
  });

  /*
   * The point of showing the losers at all: the beaten hand is the only thing
   * that explains the size of the pot, and the player who just lost it has
   * the most reason to want to see it.
   */
  it('puts every winner before anybody beaten', () => {
    const carol = player('carol', [card(9, 'c'), card(9, 'd')]);
    const hands = pick([winner('bob', 'Straight')], [alice, bob, carol]);
    expect(hands[0]!.outcome).toBe('won');
    expect(hands.slice(1).every((h) => h.outcome === 'lost')).toBe(true);
    expect(hands.map((h) => h.playerId)).toEqual(['bob', 'alice', 'carol']);
  });

  it('does not show a folded hand, which was paid for to stay hidden', () => {
    const folded = { ...player('carol', [card(9, 'c'), card(9, 'd')]), folded: true };
    const hands = pick([winner('alice', 'Flush')], [alice, bob, folded]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice', 'bob']);
  });

  it('does not show somebody sitting the hand out', () => {
    const out = { ...player('carol', [card(9, 'c'), card(9, 'd')]), sittingOut: true };
    const hands = pick([winner('alice', 'Flush')], [alice, bob, out]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice', 'bob']);
  });

  /*
   * Everybody folding is not a showdown. Nothing was tabled, so nothing is
   * turned face up.
   */
  it('shows nothing of an uncontested pot', () => {
    const hands = pick([winner('alice', 'Flush')], [alice, bob], 'nobody', false, false);
    expect(hands.map((h) => h.playerId)).toEqual(['alice']);
  });

  it('withholds the local losing hand too', () => {
    const hands = pick([winner('alice', 'Flush')], [alice, bob], 'bob', false);
    expect(hands.map((h) => h.playerId)).toEqual(['alice']);
  });

  it('shows only the exposed card from a local hand that still mucks at showdown', () => {
    const hands = selectShowdownHands([winner('alice', 'Flush')], [alice, bob], {
      localPlayerId: 'bob',
      localCardsShown: false,
      label: (w) => w.label,
      contested: true,
      cardExposure: (playerId) => (playerId === 'bob' ? [true, false] : undefined),
    });
    const bobHand = hands.find((h) => h.playerId === 'bob');
    expect(bobHand?.hole).toEqual([bob.holeCards[0], null]);
  });

  it('does not treat one exposed card as a full tabled hand', () => {
    const hands = selectShowdownHands([winner('alice', 'Flush')], [alice, bob], {
      localPlayerId: 'bob',
      localCardsShown: false,
      label: (w) => w.label,
      contested: true,
      cardExposure: (playerId) => (playerId === 'bob' ? [false, true] : undefined),
    });
    const bobHand = hands.find((h) => h.playerId === 'bob');
    expect(bobHand?.hole).toEqual([null, bob.holeCards[1]]);
  });

  it('lays out both hands of a split pot, which used to drop one', () => {
    const hands = pick([winner('alice', 'Straight'), winner('bob', 'Straight')], [alice, bob]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice', 'bob']);
    expect(hands.every((h) => h.outcome === 'won')).toBe(true);
  });

  it('does not credit a win to a winner who tabled nothing', () => {
    const noHand = { playerId: 'bob', hand: null, label: '' };
    const hands = pick([winner('alice', 'Flush'), noHand as never], [alice, bob]);
    expect(hands.map((h) => [h.playerId, h.outcome])).toEqual([['alice', 'won'], ['bob', 'lost']]);
  });

  it('skips anyone holding no cards, which the rules refuse to publish', () => {
    const busted = player('bob', []);
    const hands = pick([winner('alice', 'Flush'), winner('bob', 'Flush')], [alice, busted]);
    expect(hands.map((h) => h.playerId)).toEqual(['alice']);
  });

  it('withholds the local hand until its owner tables it', () => {
    const hidden = pick([winner('alice', 'Flush')], [alice, bob], 'alice', false);
    expect(hidden.map((h) => h.playerId)).toEqual([]);
    const shown = pick([winner('alice', 'Flush')], [alice, bob], 'alice', true);
    expect(shown.map((h) => h.playerId)).toEqual(['alice', 'bob']);
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

  /*
   * This used to stop at three, so a four way split showed three hands and
   * told the fourth winner they had not won.
   */
  it('shows every hand of a four way split', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => player(id, [card(2, 's'), card(3, 's')]));
    const hands = pick(many.map((p) => winner(p.id, 'Two pair')), many);
    expect(hands.map((h) => h.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(hands.every((h) => h.outcome === 'won')).toBe(true);
  });

  it('caps at a full table, which is as many hands as a board that plays can split', () => {
    const many = 'abcdefgh'.split('').map((id) => player(id, [card(2, 's'), card(3, 's')]));
    const hands = pick(many.map((p) => winner(p.id, 'Two pair')), many);
    expect(hands).toHaveLength(MAX_REVEAL_HANDS);
  });
});

describe('layoutRevealHands', () => {
  const SIX = ['a', 'b', 'c', 'd', 'e', 'f'];
  const base = {
    centreX: 230,
    top: 300,
    preferredSize: 56,
    availableW: 320,
    availableH: 200,
  };
  const cardH = base.preferredSize * CARD_ASPECT;

  const span = (hands: ReturnType<typeof layoutRevealHands>) => {
    const xs = hands.flatMap((h) => h.targets.map((t) => t.x));
    const size = hands[0]!.size;
    return { left: Math.min(...xs) - size / 2, right: Math.max(...xs) + size / 2 };
  };

  it('places nothing when there is nothing to show', () => {
    expect(layoutRevealHands({ ...base, count: 0, playerIds: [] })).toEqual([]);
  });

  it('centres one hand under the board, two cards either side', () => {
    const [hand] = layoutRevealHands({ ...base, count: 1, playerIds: ['alice'] });
    expect(hand!.size).toBe(base.preferredSize);
    const [left, right] = hand!.targets;
    expect((left!.x + right!.x) / 2).toBeCloseTo(base.centreX, 5);
    expect(right!.x - left!.x).toBeCloseTo(base.preferredSize + CARD_GAP, 5);
    expect(left!.y).toBe(right!.y);
  });

  /*
   * The whole point of the change: the hand belongs below the board, not
   * alongside it, so the board never has to shrink to make room.
   */
  it('sits the hand below the board rather than beside it', () => {
    const [hand] = layoutRevealHands({ ...base, count: 1, playerIds: ['alice'] });
    expect(hand!.targets[0]!.y - cardH / 2).toBeCloseTo(base.top, 5);
  });

  it('does not grow a card beyond the size it was offered', () => {
    const [hand] = layoutRevealHands({ ...base, count: 1, availableW: 10_000, playerIds: ['a'] });
    expect(hand!.size).toBe(base.preferredSize);
  });

  /*
   * The bug this replaced: stacking put each extra hand in a lane barely one
   * card tall, so a split pot shrank both hands to the legibility floor. Side
   * by side, four cards are narrower than the five card board above them, so
   * a split costs the cards nothing at all.
   */
  it('keeps a split pot at full size, where stacking collapsed it', () => {
    const hands = layoutRevealHands({ ...base, count: 2, playerIds: ['alice', 'bob'] });
    expect(hands).toHaveLength(2);
    expect(hands.every((h) => h.size === base.preferredSize)).toBe(true);
  });

  it('lays a split pot out across one line, not down the felt', () => {
    const hands = layoutRevealHands({ ...base, count: 2, playerIds: ['alice', 'bob'] });
    const ys = hands.flatMap((h) => h.targets.map((t) => t.y));
    expect(new Set(ys).size).toBe(1);
    expect(hands[1]!.targets[0]!.x).toBeGreaterThan(hands[0]!.targets[1]!.x);
  });

  it('centres the whole row, however many hands are in it', () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const hands = layoutRevealHands({ ...base, count, playerIds: SIX });
      const { left, right } = span(hands);
      expect((left + right) / 2).toBeCloseTo(base.centreX, 5);
    }
  });

  it('separates two hands more than it separates one hand\u2019s own cards', () => {
    const hands = layoutRevealHands({ ...base, count: 2, playerIds: ['a', 'b'] });
    const size = hands[0]!.size;
    const within = hands[0]!.targets[1]!.x - hands[0]!.targets[0]!.x - size;
    const between = hands[1]!.targets[0]!.x - hands[0]!.targets[1]!.x - size;
    expect(within).toBeCloseTo(CARD_GAP, 5);
    expect(between).toBeCloseTo(HAND_GAP, 5);
    expect(between).toBeGreaterThan(within);
  });

  it('fits every hand inside the width it was given', () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const hands = layoutRevealHands({ ...base, count, playerIds: SIX });
      const { left, right } = span(hands);
      expect(right - left).toBeLessThanOrEqual(base.availableW + 0.001);
      expect(left).toBeGreaterThanOrEqual(base.centreX - base.availableW / 2 - 0.001);
    }
  });

  it('fits the row inside the room below the board', () => {
    const hands = layoutRevealHands({ ...base, count: 2, availableH: 60, playerIds: ['a', 'b'] });
    const h = hands[0]!.size * CARD_ASPECT;
    expect(hands[0]!.targets[0]!.y - h / 2).toBeCloseTo(base.top, 5);
    expect(hands[0]!.targets[0]!.y + h / 2).toBeLessThanOrEqual(base.top + 60 + 0.001);
  });

  it('shrinks the cards only once the extra hands no longer fit', () => {
    const tight = { ...base, availableW: 240 };
    const one = layoutRevealHands({ ...tight, count: 1, playerIds: ['a'] })[0]!.size;
    const two = layoutRevealHands({ ...tight, count: 2, playerIds: ['a', 'b'] })[0]!.size;
    const three = layoutRevealHands({ ...tight, count: 3, playerIds: ['a', 'b', 'c'] })[0]!.size;
    expect(one).toBe(base.preferredSize);
    expect(two).toBeLessThan(one);
    expect(three).toBeLessThan(two);
  });

  it('gives every hand the same size, so none looks like the real winner', () => {
    const hands = layoutRevealHands({ ...base, count: 3, playerIds: ['a', 'b', 'c'] });
    expect(new Set(hands.map((h) => h.size)).size).toBe(1);
  });

  it('stops shrinking at the point a card stops being readable', () => {
    const hands = layoutRevealHands({ ...base, count: 3, availableW: 240, playerIds: ['a', 'b', 'c'] });
    expect(hands.every((h) => h.size >= MIN_REVEAL_CARD)).toBe(true);
  });

  /*
   * The floor used to be absolute, so six hands held at 24pt ran a 340pt row
   * across 320pt of felt and drew cards over the rail. Staying on the table
   * beats staying readable.
   */
  it('gives up the floor rather than running off the felt', () => {
    const hands = layoutRevealHands({ ...base, count: 6, availableW: 200, playerIds: SIX });
    const { left, right } = span(hands);
    expect(hands[0]!.size).toBeLessThan(MIN_REVEAL_CARD);
    expect(right - left).toBeLessThanOrEqual(200.001);
  });

  it('never returns more hands than it will lay out', () => {
    const hands = layoutRevealHands({ ...base, count: 9, playerIds: SIX });
    expect(hands).toHaveLength(MAX_REVEAL_HANDS);
  });

  /*
   * What the user asked for: a three or four way split shrinks into the same
   * row of cards on the felt that a two way split uses, rather than being
   * truncated or stacked. `FELT_W` is the cloth on an iPhone 17 Pro, which is
   * what the row is now given instead of the narrower board.
   */
  describe('a multi-way split', () => {
    const FELT_W = 347;
    const felt = { ...base, availableW: FELT_W };

    it('keeps every hand on one line, on real felt', () => {
      for (const count of [3, 4, 5, 6]) {
        const hands = layoutRevealHands({ ...felt, count, playerIds: SIX });
        expect(hands).toHaveLength(count);
        expect(new Set(hands.flatMap((h) => h.targets.map((t) => t.y))).size).toBe(1);
      }
    });

    it('keeps a three or four way split comfortably readable', () => {
      for (const count of [3, 4]) {
        const hands = layoutRevealHands({ ...felt, count, playerIds: SIX });
        expect(hands[0]!.size).toBeGreaterThanOrEqual(30);
      }
    });

    /*
     * Five and six ways are a board that plays for nearly the whole table, so
     * they are allowed to reach the floor rather than being refused.
     */
    it('still holds the rarest splits at the legibility floor', () => {
      for (const count of [5, 6]) {
        const hands = layoutRevealHands({ ...felt, count, playerIds: SIX });
        expect(hands[0]!.size).toBeGreaterThanOrEqual(MIN_REVEAL_CARD);
      }
    });

    it('still reads as hands rather than one long row', () => {
      for (const count of [3, 4, 5, 6]) {
        const hands = layoutRevealHands({ ...felt, count, playerIds: SIX });
        const size = hands[0]!.size;
        const within = hands[0]!.targets[1]!.x - hands[0]!.targets[0]!.x - size;
        const between = hands[1]!.targets[0]!.x - hands[0]!.targets[1]!.x - size;
        expect(between).toBeGreaterThan(within);
      }
    });

    it('spends the gaps before it spends the cards', () => {
      const three = layoutRevealHands({ ...felt, count: 3, playerIds: SIX });
      const size = three[0]!.size;
      const between = three[1]!.targets[0]!.x - three[0]!.targets[1]!.x - size;
      expect(between).toBeLessThan(HAND_GAP);
      expect(between).toBeGreaterThanOrEqual(MIN_HAND_GAP);
    });
  });
});

describe('handGapFor', () => {
  it('leaves a pair of hands the full gap', () => {
    expect(handGapFor(1)).toBe(HAND_GAP);
    expect(handGapFor(2)).toBe(HAND_GAP);
  });

  it('closes the gap as the row fills up', () => {
    expect(handGapFor(3)).toBeLessThan(handGapFor(2));
    expect(handGapFor(4)).toBeLessThan(handGapFor(3));
  });

  it('never closes it past the point two hands would merge', () => {
    for (const hands of [5, 6, 9]) expect(handGapFor(hands)).toBe(MIN_HAND_GAP);
  });

  it('always keeps hands further apart than the cards within one', () => {
    for (const hands of [1, 2, 3, 4, 5, 6]) expect(handGapFor(hands)).toBeGreaterThan(CARD_GAP);
  });
});

describe('showdownLabel', () => {
  const hand = (playerId: string, label: string) =>
    ({ playerId, name: playerId, hole: [], label, outcome: 'won' as const });

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

/*
 * The cloth on an iPhone 17 Pro: the table area less the oval's inset and its
 * rail on both sides, and the stage less the same top and bottom.
 */
const FELT = { width: 370, height: 374, centreY: 201 };

describe('feltWidthAt', () => {
  it('is widest across the middle', () => {
    expect(feltWidthAt(FELT.centreY, FELT)).toBeCloseTo(FELT.width, 5);
  });

  it('narrows the further a row sits from the middle', () => {
    const near = feltWidthAt(FELT.centreY + 40, FELT);
    const far = feltWidthAt(FELT.centreY + 120, FELT);
    expect(near).toBeLessThan(FELT.width);
    expect(far).toBeLessThan(near);
  });

  it('is the same above the middle as below it', () => {
    expect(feltWidthAt(FELT.centreY - 70, FELT)).toBeCloseTo(feltWidthAt(FELT.centreY + 70, FELT), 5);
  });

  it('runs out at the ends rather than going imaginary', () => {
    expect(feltWidthAt(FELT.centreY + FELT.height, FELT)).toBe(0);
    expect(feltWidthAt(-1000, FELT)).toBe(0);
  });

  it('has no width when there is no table yet', () => {
    expect(feltWidthAt(0, { width: 0, height: 0, centreY: 0 })).toBe(0);
  });
});

describe('fitBoardCard', () => {
  const base = {
    cells: 5,
    cellPad: 4,
    minSize: 28,
    widthAt: (y: number) => feltWidthAt(y, FELT),
  };
  /** The board pinned below the winning-hand pill, as it sits at a showdown. */
  const pinned = (top: number) => (size: number) => top + size * CARD_ASPECT + 4;

  it('takes the ceiling when the cloth is wider than the ceiling needs', () => {
    const size = fitBoardCard({ ...base, ceiling: 40, rowBottom: pinned(188) });
    expect(size).toBe(40);
  });

  /*
   * The whole reason this is a search rather than one division: the answer
   * decides where the row sits, and where the row sits decides the answer.
   */
  it('settles on a size whose own row actually fits', () => {
    const size = fitBoardCard({ ...base, ceiling: 90, rowBottom: pinned(188) });
    const bottom = pinned(188)(size);
    expect(base.cells * (size + base.cellPad)).toBeLessThanOrEqual(base.widthAt(bottom));
  });

  it('leaves nothing on the table: one point more would not fit', () => {
    const size = fitBoardCard({ ...base, ceiling: 90, rowBottom: pinned(188) });
    const bigger = size + 1;
    expect(base.cells * (bigger + base.cellPad)).toBeGreaterThan(base.widthAt(pinned(188)(bigger)));
  });

  it('gives a row nearer the middle of the felt a bigger card', () => {
    const high = fitBoardCard({ ...base, ceiling: 90, rowBottom: pinned(150) });
    const low = fitBoardCard({ ...base, ceiling: 90, rowBottom: pinned(230) });
    expect(high).toBeGreaterThan(low);
  });

  it('spends a smaller cell cost on the cards', () => {
    const tight = fitBoardCard({ ...base, cellPad: 4, ceiling: 90, rowBottom: pinned(188) });
    const padded = fitBoardCard({ ...base, cellPad: 10, ceiling: 90, rowBottom: pinned(188) });
    expect(tight).toBeGreaterThan(padded);
  });

  it('refuses to go below a readable card even off the end of the felt', () => {
    const size = fitBoardCard({ ...base, ceiling: 90, rowBottom: () => 10_000 });
    expect(size).toBe(base.minSize);
  });

  it('never returns more than it was allowed', () => {
    for (const ceiling of [28, 35, 50, 61, 90]) {
      expect(fitBoardCard({ ...base, ceiling, rowBottom: pinned(188) })).toBeLessThanOrEqual(ceiling);
    }
  });

  it('rounds a fractional ceiling down to a whole point', () => {
    expect(fitBoardCard({ ...base, ceiling: 40.9, rowBottom: pinned(188) })).toBe(40);
  });
});

describe('only hands that were actually shown get laid out', () => {
  /*
   * The row under the board used to hold every hand still in the pot, which
   * is not what a showdown does. Hands are tabled in turn and a player who is
   * not obliged to show can throw theirs away; printing it under the board
   * anyway hands the table information its owner just paid to keep.
   *
   * `shownIds` is what the table passes once it has walked the order.
   */
  const alice = player('alice', [card(14, 's'), card(13, 's')]);
  const bob = player('bob', [card(14, 'h'), card(13, 'h')]);
  const carol = player('carol', [card(9, 'd'), card(8, 'd')]);

  const pickShown = (shownIds: string[]) =>
    selectShowdownHands([winner('alice', 'Flush')], [alice, bob, carol], {
      localPlayerId: 'nobody',
      localCardsShown: false,
      label: (w) => w.label,
      contested: true,
      shownIds,
    });

  it('leaves out a hand that was mucked', () => {
    const rows = pickShown(['alice', 'bob']);
    expect(rows.map((r) => r.playerId)).toEqual(['alice', 'bob']);
    expect(rows.map((r) => r.playerId)).not.toContain('carol');
  });

  it('shows nothing but the winner when everyone else mucked', () => {
    const rows = pickShown(['alice']);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe('alice');
    expect(rows[0].outcome).toBe('won');
  });

  it('still marks a shown loser as beaten', () => {
    const rows = pickShown(['alice', 'carol']);
    const carolRow = rows.find((r) => r.playerId === 'carol');
    expect(carolRow?.outcome).toBe('lost');
  });

  it('lays out every hand when the table did not walk an order', () => {
    // Omitted entirely, the old behaviour stands: an all-in run-out tables
    // every hand because nobody had a decision to make.
    const rows = selectShowdownHands([winner('alice', 'Flush')], [alice, bob, carol], {
      localPlayerId: 'nobody',
      localCardsShown: false,
      label: (w) => w.label,
      contested: true,
    });
    expect(rows).toHaveLength(3);
  });

  it('never lays out a hand nobody showed', () => {
    expect(pickShown([])).toHaveLength(0);
  });
});
