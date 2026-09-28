import { describe, it, expect } from 'vitest';

import { emptyCounters, type ObservedCounters } from '../observedStats';
import {
  absorbTable,
  historyFor,
  isDurableOpponentKey,
  mergeCounters,
  pruneHistory,
  MAX_REMEMBERED_OPPONENTS,
} from '../opponentHistory';

const counters = (over: Partial<ObservedCounters> = {}): ObservedCounters => ({
  ...emptyCounters(),
  ...over,
});

describe('mergeCounters', () => {
  it('adds every field, since the counters are additive by construction', () => {
    const merged = mergeCounters(
      counters({ handsSeen: 10, vpipHands: 4, pfrHands: 2, aggressiveActions: 6, calls: 3, handsWon: 2, showdowns: 1, showdownWins: 1 }),
      counters({ handsSeen: 5, vpipHands: 1, pfrHands: 1, aggressiveActions: 2, calls: 1, handsWon: 1, showdowns: 1, showdownWins: 0 }),
    );
    expect(merged).toEqual(counters({
      handsSeen: 15, vpipHands: 5, pfrHands: 3, aggressiveActions: 8, calls: 4, handsWon: 3, showdowns: 2, showdownWins: 1,
    }));
  });

  it('leaves an empty side alone', () => {
    const only = counters({ handsSeen: 3 });
    expect(mergeCounters(emptyCounters(), only)).toEqual(only);
  });
});

describe('isDurableOpponentKey', () => {
  it('remembers real players', () => {
    expect(isDurableOpponentKey('firebase-uid-123')).toBe(true);
  });

  it('forgets bots, whose ids are regenerated per table', () => {
    expect(isDurableOpponentKey('bot1')).toBe(false);
    expect(isDurableOpponentKey('bot-easy-2')).toBe(false);
  });

  it('forgets you, and anything missing', () => {
    expect(isDurableOpponentKey('me')).toBe(false);
    expect(isDurableOpponentKey('')).toBe(false);
    expect(isDurableOpponentKey(null)).toBe(false);
    expect(isDurableOpponentKey(undefined)).toBe(false);
  });
});

describe('absorbTable', () => {
  it('folds a table into an empty history', () => {
    const next = absorbTable({}, { uid1: counters({ handsSeen: 8, vpipHands: 3 }) });
    expect(next.uid1.handsSeen).toBe(8);
    expect(next.uid1.vpipHands).toBe(3);
  });

  it('accumulates across sessions rather than replacing', () => {
    const first = absorbTable({}, { uid1: counters({ handsSeen: 8, handsWon: 2 }) });
    const second = absorbTable(first, { uid1: counters({ handsSeen: 5, handsWon: 1 }) });
    expect(second.uid1.handsSeen).toBe(13);
    expect(second.uid1.handsWon).toBe(3);
  });

  it('skips bots, so one row cannot become every bot ever played', () => {
    const next = absorbTable({}, { bot1: counters({ handsSeen: 20 }), uid1: counters({ handsSeen: 4 }) });
    expect(next).not.toHaveProperty('bot1');
    expect(next.uid1.handsSeen).toBe(4);
  });

  it('ignores a player who was seated but never saw a hand', () => {
    const next = absorbTable({}, { uid1: counters({ handsSeen: 0 }) });
    expect(next).toEqual({});
  });

  it('does not mutate the history it was given', () => {
    const before = { uid1: counters({ handsSeen: 2 }) };
    absorbTable(before, { uid1: counters({ handsSeen: 5 }) });
    expect(before.uid1.handsSeen).toBe(2);
  });
});

describe('historyFor', () => {
  it('reads an opponent you have met', () => {
    expect(historyFor({ uid1: counters({ handsSeen: 9 }) }, 'uid1').handsSeen).toBe(9);
  });

  it('returns empty counters for a stranger rather than undefined', () => {
    expect(historyFor({}, 'nobody')).toEqual(emptyCounters());
  });
});

describe('pruneHistory', () => {
  it('leaves a small history untouched', () => {
    const small = { a: counters({ handsSeen: 1 }) };
    expect(pruneHistory(small)).toBe(small);
  });

  it('keeps the opponents you have played most when it overflows', () => {
    const many: Record<string, ObservedCounters> = {};
    for (let i = 0; i < MAX_REMEMBERED_OPPONENTS + 20; i += 1) {
      many[`uid${i}`] = counters({ handsSeen: i });
    }
    const pruned = pruneHistory(many);
    expect(Object.keys(pruned)).toHaveLength(MAX_REMEMBERED_OPPONENTS);
    // The busiest opponent survives, the quietest does not.
    expect(pruned[`uid${MAX_REMEMBERED_OPPONENTS + 19}`]).toBeDefined();
    expect(pruned.uid0).toBeUndefined();
  });
});
