import { describe, expect, it } from 'vitest';
import {
  applyBlindLevel,
  blindsDue,
  isEliminated,
  levelAt,
  STANDARD_STRUCTURE,
  STRUCTURES,
  tournamentWinner,
  TURBO_STRUCTURE,
} from '../tournament';

const S = STANDARD_STRUCTURE;
const MIN = 60 * 1000;

describe('levelAt', () => {
  it('starts on the first level', () => {
    const at = levelAt(S, 0);
    expect(at.index).toBe(0);
    expect(at.level).toEqual(S.levels[0]);
    expect(at.msUntilNextLevel).toBe(S.levelMs);
  });

  it('climbs on the level boundary, not a moment before', () => {
    expect(levelAt(S, S.levelMs - 1).index).toBe(0);
    expect(levelAt(S, S.levelMs).index).toBe(1);
  });

  it('counts down to the next level', () => {
    const at = levelAt(S, 10 * MIN + 2 * MIN);
    expect(at.index).toBe(1);
    expect(at.msUntilNextLevel).toBe(8 * MIN);
    expect(at.nextLevel).toEqual(S.levels[2]);
  });

  /*
   * The reason this takes elapsed time rather than reading a clock: a phone
   * that was asleep must land on the right level the moment it wakes, not
   * resume counting from where it stopped.
   */
  it('lands on the right level after a long gap rather than catching up slowly', () => {
    expect(levelAt(S, 35 * MIN).index).toBe(3);
  });

  it('stays on the last level forever, with nothing to count down to', () => {
    const last = S.levels.length - 1;
    const at = levelAt(S, S.levelMs * 500);
    expect(at.index).toBe(last);
    expect(at.msUntilNextLevel).toBeNull();
    expect(at.nextLevel).toBeNull();
  });

  it('treats a nonsense clock as the start rather than the end', () => {
    // A clock that is briefly wrong must not jump the tournament to its final
    // level and nor may it throw.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(levelAt(S, bad).index, String(bad)).toBe(0);
    }
  });

  it('never goes backwards as time passes', () => {
    let last = -1;
    for (let t = 0; t < S.levelMs * 15; t += MIN) {
      const i = levelAt(S, t).index;
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });
});

describe('the structures themselves', () => {
  it('always climbs, never flattens or dips', () => {
    for (const s of Object.values(STRUCTURES)) {
      for (let i = 1; i < s.levels.length; i += 1) {
        expect(s.levels[i].bigBlind, `${s.id} level ${i}`).toBeGreaterThan(s.levels[i - 1].bigBlind);
        expect(s.levels[i].smallBlind).toBeGreaterThan(s.levels[i - 1].smallBlind);
      }
    }
  });

  it('keeps the small blind half the big blind', () => {
    for (const s of Object.values(STRUCTURES)) {
      for (const l of s.levels) expect(l.bigBlind).toBe(l.smallBlind * 2);
    }
  });

  it('starts without antes and adds them once blinds are worth stealing', () => {
    expect(S.levels[0].ante).toBe(0);
    expect(S.levels[S.levels.length - 1].ante).toBeGreaterThan(0);
  });

  it('never lets the ante rival the blind', () => {
    // An ante that approaches the big blind makes every pot a scramble before
    // anybody has acted.
    for (const s of Object.values(STRUCTURES)) {
      for (const l of s.levels) expect(l.ante).toBeLessThan(l.bigBlind / 2);
    }
  });

  it('runs turbo on the same ladder, only faster', () => {
    expect(TURBO_STRUCTURE.levels).toEqual(STANDARD_STRUCTURE.levels);
    expect(TURBO_STRUCTURE.levelMs).toBeLessThan(STANDARD_STRUCTURE.levelMs);
  });
});

describe('ending the tournament', () => {
  const p = (id: string, chips: number) => ({ id, chips });

  it('ends when one player holds every chip', () => {
    expect(tournamentWinner([p('a', 5000), p('b', 0), p('c', 0)])).toBe('a');
  });

  it('is not over while two players still have chips', () => {
    expect(tournamentWinner([p('a', 10), p('b', 4990)])).toBeNull();
  });

  it('crowns nobody rather than an arbitrary seat if the state is broken', () => {
    expect(tournamentWinner([p('a', 0), p('b', 0)])).toBeNull();
    expect(tournamentWinner([])).toBeNull();
  });
});

describe('isEliminated', () => {
  it('puts a busted player out of a tournament', () => {
    expect(isEliminated({ chips: 0 }, true)).toBe(true);
  });

  it('leaves a busted player in a cash game, where they can rebuy', () => {
    // The whole difference between the two: a cash game lets you buy back in.
    expect(isEliminated({ chips: 0 }, false)).toBe(false);
  });

  it('does not eliminate anybody who still has chips', () => {
    expect(isEliminated({ chips: 1 }, true)).toBe(false);
  });
});

describe('moving the blinds up', () => {
  const game = (smallBlind: number, bigBlind: number, ante = 0) => ({
    config: { smallBlind, bigBlind, ante, startingStack: 5000 },
    players: [{ id: 'a', chips: 100 }],
    handNumber: 7,
  });

  it('swaps the three numbers and leaves everything else alone', () => {
    // Rebuilding the game instead would reset the stacks, the button and the
    // deck, which is everything a tournament is keeping track of.
    const before = game(10, 20);
    const after = applyBlindLevel(before, { smallBlind: 25, bigBlind: 50, ante: 5 });
    expect(after.config.smallBlind).toBe(25);
    expect(after.config.bigBlind).toBe(50);
    expect(after.config.ante).toBe(5);
    expect(after.config.startingStack).toBe(5000);
    expect(after.players).toEqual(before.players);
    expect(after.handNumber).toBe(7);
  });

  it('hands back the very same object when nothing moved', () => {
    const before = game(25, 50, 5);
    expect(applyBlindLevel(before, { smallBlind: 25, bigBlind: 50, ante: 5 })).toBe(before);
  });

  it('knows when a level is actually due', () => {
    expect(blindsDue({ smallBlind: 10, bigBlind: 20, ante: 0 }, { smallBlind: 10, bigBlind: 20, ante: 0 })).toBe(false);
    expect(blindsDue({ smallBlind: 10, bigBlind: 20, ante: 0 }, { smallBlind: 15, bigBlind: 30, ante: 0 })).toBe(true);
    // An ante arriving is a level change even when the blinds have not moved.
    expect(blindsDue({ smallBlind: 50, bigBlind: 100, ante: 0 }, { smallBlind: 50, bigBlind: 100, ante: 10 })).toBe(true);
  });

  it('treats a missing ante as no ante', () => {
    expect(blindsDue({ smallBlind: 10, bigBlind: 20 }, { smallBlind: 10, bigBlind: 20, ante: 0 })).toBe(false);
  });
});
