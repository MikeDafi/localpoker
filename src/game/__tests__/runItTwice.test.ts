import { describe, expect, it } from 'vitest';
import {
  agreedRuns,
  canRunItTwice,
  MAX_RUNS,
  splitPotAcrossRuns,
  votingComplete,
  type RunVote,
} from '../runItTwice';

const human = (id: string, choice: RunVote['choice']): RunVote => ({ playerId: id, choice, isBot: false });
const bot = (id: string, choice: RunVote['choice'] = null): RunVote => ({ playerId: id, choice, isBot: true });

describe('agreedRuns', () => {
  it('takes the highest number anybody asked for', () => {
    expect(agreedRuns([human('a', 1), human('b', 3)])).toBe(3);
    expect(agreedRuns([human('a', 2), human('b', 1)])).toBe(2);
  });

  it('runs once when nobody asked for more', () => {
    expect(agreedRuns([human('a', 1), human('b', 1)])).toBe(1);
  });

  it('runs once when nobody has answered yet', () => {
    expect(agreedRuns([human('a', null), human('b', null)])).toBe(1);
  });

  it('ignores players who have not answered', () => {
    expect(agreedRuns([human('a', 3), human('b', null)])).toBe(3);
  });

  /*
   * Bots have no view on variance, and letting them vote would mean they
   * settled it between themselves on every all-in a human was not part of.
   */
  it('gives bots no say', () => {
    expect(agreedRuns([human('a', 1), bot('b', 3)])).toBe(1);
    expect(agreedRuns([human('a', 2), bot('b', 3), bot('c', 3)])).toBe(2);
  });

  it('runs once when only bots are involved', () => {
    expect(agreedRuns([bot('a', 3), bot('b', 2)])).toBe(1);
    expect(agreedRuns([])).toBe(1);
  });

  it('never exceeds the cap', () => {
    expect(agreedRuns([human('a', 3)])).toBeLessThanOrEqual(MAX_RUNS);
  });
});

describe('votingComplete', () => {
  it('waits for every human answer', () => {
    expect(votingComplete([human('a', 1), human('b', null)])).toBe(false);
    expect(votingComplete([human('a', 1), human('b', 2)])).toBe(true);
  });

  it('does not wait on bots', () => {
    expect(votingComplete([human('a', 1), bot('b', null)])).toBe(true);
    expect(votingComplete([bot('a', null)])).toBe(true);
  });
});

describe('splitPotAcrossRuns', () => {
  it('splits evenly when it divides', () => {
    expect(splitPotAcrossRuns(300, 3)).toEqual([100, 100, 100]);
    expect(splitPotAcrossRuns(200, 2)).toEqual([100, 100]);
  });

  it('gives the odd chips to the earliest runs', () => {
    // A chip cannot be cut in three, and where it goes has to be fixed rather
    // than depending on who won which board.
    expect(splitPotAcrossRuns(101, 3)).toEqual([34, 34, 33]);
    expect(splitPotAcrossRuns(101, 2)).toEqual([51, 50]);
  });

  it('never loses or invents a chip', () => {
    for (const pot of [1, 2, 7, 99, 101, 1000, 12345]) {
      for (const runs of [1, 2, 3]) {
        const shares = splitPotAcrossRuns(pot, runs);
        expect(shares.reduce((a, b) => a + b, 0), `pot ${pot} over ${runs}`).toBe(pot);
      }
    }
  });

  it('gives one share per run', () => {
    expect(splitPotAcrossRuns(100, 1)).toHaveLength(1);
    expect(splitPotAcrossRuns(100, 2)).toHaveLength(2);
    expect(splitPotAcrossRuns(100, 3)).toHaveLength(3);
  });

  it('handles a pot smaller than the number of runs', () => {
    expect(splitPotAcrossRuns(2, 3)).toEqual([1, 1, 0]);
  });

  it('refuses nonsense rather than producing it', () => {
    expect(splitPotAcrossRuns(0, 2)).toEqual([]);
    expect(splitPotAcrossRuns(-5, 2)).toEqual([]);
    expect(splitPotAcrossRuns(Number.NaN, 2)).toEqual([]);
  });

  it('clamps the run count to the cap', () => {
    expect(splitPotAcrossRuns(100, 99)).toHaveLength(MAX_RUNS);
    expect(splitPotAcrossRuns(100, 0)).toHaveLength(1);
  });
});

describe('canRunItTwice', () => {
  const allIn = { allIn: true, chips: 0 };
  const active = { allIn: false, chips: 500 };

  it('allows it when everyone left is all in and a card is still to come', () => {
    expect(canRunItTwice({ contesting: [allIn, allIn], boardLength: 3 })).toBe(true);
    expect(canRunItTwice({ contesting: [allIn, allIn], boardLength: 0 })).toBe(true);
  });

  it('allows it when one player is covered and cannot act alone', () => {
    // A lone player with chips left has nobody to bet against.
    expect(canRunItTwice({ contesting: [allIn, active], boardLength: 4 })).toBe(true);
  });

  it('refuses while two players can still bet', () => {
    // Offering it here would sell information about the board before a call.
    expect(canRunItTwice({ contesting: [active, active], boardLength: 3 })).toBe(false);
  });

  it('refuses once the board is complete', () => {
    expect(canRunItTwice({ contesting: [allIn, allIn], boardLength: 5 })).toBe(false);
  });

  it('refuses without an opponent', () => {
    expect(canRunItTwice({ contesting: [allIn], boardLength: 3 })).toBe(false);
    expect(canRunItTwice({ contesting: [], boardLength: 3 })).toBe(false);
  });
});
