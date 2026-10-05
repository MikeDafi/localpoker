import { describe, expect, it } from 'vitest';
import {
  MAX_CONSECUTIVE_TIMEOUTS,
  abandonedPlayers,
  forgetTimeouts,
  hasAbandonedTable,
  noteActed,
  noteTimeout,
} from '../turnTimeouts';

describe('consecutive turn timeouts', () => {
  const missTimes = (id: string, times: number) => {
    let counts = {};
    for (let i = 0; i < times; i += 1) counts = noteTimeout(counts, id);
    return counts;
  };

  it('does not give up a seat for the odd missed turn', () => {
    for (let misses = 0; misses < MAX_CONSECUTIVE_TIMEOUTS; misses += 1) {
      expect(hasAbandonedTable(missTimes('a', misses), 'a')).toBe(false);
    }
  });

  it('gives up the seat on the fifth miss in a row', () => {
    expect(hasAbandonedTable(missTimes('a', MAX_CONSECUTIVE_TIMEOUTS), 'a')).toBe(true);
  });

  /*
   * The whole point of counting consecutively. Somebody who misses a few
   * turns, acts, then misses a few more has not gone anywhere, and should
   * never creep towards removal across a long session.
   */
  it('starts again the moment they actually act', () => {
    let counts = missTimes('a', MAX_CONSECUTIVE_TIMEOUTS - 1);
    counts = noteActed(counts, 'a');
    expect(hasAbandonedTable(counts, 'a')).toBe(false);

    for (let i = 0; i < MAX_CONSECUTIVE_TIMEOUTS - 1; i += 1) counts = noteTimeout(counts, 'a');
    expect(hasAbandonedTable(counts, 'a')).toBe(false);
  });

  it('counts each player separately', () => {
    let counts = missTimes('a', MAX_CONSECUTIVE_TIMEOUTS);
    counts = noteTimeout(counts, 'b');
    expect(hasAbandonedTable(counts, 'a')).toBe(true);
    expect(hasAbandonedTable(counts, 'b')).toBe(false);
  });

  it('lists everyone who has stopped answering, in a stable order', () => {
    let counts = {};
    for (const id of ['zoe', 'ravi', 'mika']) {
      for (let i = 0; i < MAX_CONSECUTIVE_TIMEOUTS; i += 1) counts = noteTimeout(counts, id);
    }
    counts = noteTimeout(counts, 'nina');
    expect(abandonedPlayers(counts)).toEqual(['mika', 'ravi', 'zoe']);
  });

  it('never mutates what it was given', () => {
    const counts = missTimes('a', 2);
    const before = JSON.stringify(counts);
    noteTimeout(counts, 'a');
    noteActed(counts, 'a');
    forgetTimeouts(counts, 'a');
    expect(JSON.stringify(counts)).toBe(before);
  });

  it('shrugs off an empty id and an unknown player', () => {
    const counts = missTimes('a', 1);
    expect(noteTimeout(counts, '')).toBe(counts);
    expect(noteActed(counts, 'nobody')).toBe(counts);
    expect(hasAbandonedTable({}, 'nobody')).toBe(false);
    expect(abandonedPlayers({})).toEqual([]);
  });
});
