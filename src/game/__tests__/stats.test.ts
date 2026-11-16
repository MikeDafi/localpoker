import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATS, applyHandResult, derivedStats, coinsForHand, mergeStats,
  COINS_PER_HAND, COINS_WIN_BONUS, COINS_SHOWDOWN_WIN_BONUS, type HandResult, shortWhen, stackHistoryEnds,
}  from '../stats';

function result(over: Partial<HandResult> = {}): HandResult {
  return {
    won: false, wentToShowdown: false, wonAtShowdown: false, potWon: 0,
    net: 0, vpip: false, pfr: false, aggressor: false, endingStack: 1000, ...over,
  };
}

describe('coinsForHand', () => {
  it('no coins for a break-even / free-fold hand', () => {
    expect(coinsForHand(result())).toBe(0);
  });
  it('loses coins when you lose chips', () => {
    expect(coinsForHand(result({ net: -100 }))).toBeLessThan(0);
  });
  it('adds win + showdown-win bonuses', () => {
    expect(coinsForHand(result({ won: true }))).toBe(COINS_PER_HAND + COINS_WIN_BONUS);
    expect(coinsForHand(result({ won: true, wonAtShowdown: true }))).toBe(
      COINS_PER_HAND + COINS_WIN_BONUS + COINS_SHOWDOWN_WIN_BONUS,
    );
  });
});

describe('applyHandResult', () => {
  it('increments hands played every hand', () => {
    let s = DEFAULT_STATS;
    s = applyHandResult(s, result()).stats;
    s = applyHandResult(s, result()).stats;
    expect(s.handsPlayed).toBe(2);
  });

  it('tracks a won hand (fold win, no showdown)', () => {
    const { stats, coinsEarned } = applyHandResult(DEFAULT_STATS, result({ won: true, potWon: 120, net: 80 }));
    expect(stats.handsWon).toBe(1);
    expect(stats.showdownsSeen).toBe(0);
    expect(stats.showdownsWon).toBe(0);
    expect(stats.biggestPotWon).toBe(120);
    expect(stats.netChips).toBe(80);
    expect(coinsEarned).toBe(COINS_PER_HAND + COINS_WIN_BONUS);
  });

  it('tracks a showdown win', () => {
    const { stats } = applyHandResult(DEFAULT_STATS, result({ won: true, wentToShowdown: true, wonAtShowdown: true, potWon: 300, net: 150 }));
    expect(stats.showdownsSeen).toBe(1);
    expect(stats.showdownsWon).toBe(1);
    expect(stats.handsWon).toBe(1);
  });

  it('tracks a showdown loss (seen but not won)', () => {
    const { stats } = applyHandResult(DEFAULT_STATS, result({ won: false, wentToShowdown: true, wonAtShowdown: false, net: -100 }));
    expect(stats.showdownsSeen).toBe(1);
    expect(stats.showdownsWon).toBe(0);
    expect(stats.handsWon).toBe(0);
    expect(stats.netChips).toBe(-100);
  });

  it('accumulates VPIP / PFR / aggressor counts', () => {
    let s = DEFAULT_STATS;
    s = applyHandResult(s, result({ vpip: true, pfr: true, aggressor: true })).stats;
    s = applyHandResult(s, result({ vpip: true, pfr: false })).stats;
    s = applyHandResult(s, result({ vpip: false })).stats;
    expect(s.vpipHands).toBe(2);
    expect(s.pfrHands).toBe(1);
    expect(s.handsAsAggressor).toBe(1);
    expect(s.handsPlayed).toBe(3);
  });

  it('keeps biggestPotWon as a max and ignores pots from lost hands', () => {
    let s = DEFAULT_STATS;
    s = applyHandResult(s, result({ won: true, potWon: 200 })).stats;
    s = applyHandResult(s, result({ won: false, potWon: 999 })).stats;
    s = applyHandResult(s, result({ won: true, potWon: 150 })).stats;
    expect(s.biggestPotWon).toBe(200);
  });

  it('appends ending stack to chipHistory and caps at 100', () => {
    let s = DEFAULT_STATS;
    for (let i = 0; i < 120; i++) s = applyHandResult(s, result({ endingStack: i })).stats;
    expect(s.chipHistory.length).toBe(100);
    expect(s.chipHistory[s.chipHistory.length - 1]).toBe(119);
  });

  it('does not mutate the input stats', () => {
    const before = { ...DEFAULT_STATS };
    applyHandResult(DEFAULT_STATS, result({ won: true }));
    expect(DEFAULT_STATS).toEqual(before);
  });
});

describe('derivedStats', () => {
  it('computes percentages and aggression factor', () => {
    let s = DEFAULT_STATS;
    s = applyHandResult(s, result({ won: true, vpip: true, pfr: true, wentToShowdown: true, wonAtShowdown: true })).stats;
    s = applyHandResult(s, result({ won: true, vpip: true, pfr: true })).stats;
    s = applyHandResult(s, result({ vpip: true, wentToShowdown: true })).stats;
    s = applyHandResult(s, result({})).stats;
    const d = derivedStats(s);
    expect(d.winRate).toBe(50);
    expect(d.vpip).toBe(75);
    expect(d.pfr).toBe(50);
    expect(d.showdownWinRate).toBe(50);
    expect(d.aggression).toBeCloseTo(2 / 3, 2);
  });

  it('is safe with zero hands', () => {
    const d = derivedStats(DEFAULT_STATS);
    expect(d.winRate).toBe(0);
    expect(d.aggression).toBe(0);
  });
});

describe('mergeStats', () => {
  it('fills defaults for partial/old stored stats', () => {
    const merged = mergeStats({ handsPlayed: 5 });
    expect(merged.handsPlayed).toBe(5);
    expect(merged.coinsEarned).toBe(0);
    expect(merged.chipHistory).toEqual([]);
  });
});

describe('chip history times', () => {
  const hand = (endingStack: number, at?: number) => ({
    won: false, wentToShowdown: false, wonAtShowdown: false, potWon: 0, net: 0,
    vpip: false, pfr: false, aggressor: false, endingStack, at,
  });

  it('records when each hand finished, index for index with the stacks', () => {
    let s = DEFAULT_STATS;
    s = applyHandResult(s, hand(100, 1000)).stats;
    s = applyHandResult(s, hand(140, 2000)).stats;
    expect(s.chipHistory).toEqual([100, 140]);
    expect(s.chipHistoryAt).toEqual([1000, 2000]);
  });

  it('marks hands saved by an older build as unknown rather than guessing a time', () => {
    const old = mergeStats({ chipHistory: [50, 60, 70] });
    const s = applyHandResult(old, hand(80, 5000)).stats;
    expect(s.chipHistory).toEqual([50, 60, 70, 80]);
    expect(s.chipHistoryAt).toEqual([0, 0, 0, 5000]);
  });

  it('keeps the two lists the same length past the cap', () => {
    let s = DEFAULT_STATS;
    for (let i = 0; i < 120; i++) s = applyHandResult(s, hand(i, i + 1)).stats;
    expect(s.chipHistoryAt).toHaveLength(100);
    expect(s.chipHistoryAt?.[99]).toBe(120);
  });
});

describe('stackHistoryEnds', () => {
  const now = new Date(2026, 10, 15, 22, 0).getTime();

  it('dates both ends when the hands were timed', () => {
    const at = [new Date(2026, 10, 12, 9, 5).getTime(), new Date(2026, 10, 15, 21, 40).getTime()];
    expect(stackHistoryEnds({ chipHistory: [100, 200], chipHistoryAt: at }, now)).toEqual(['Nov 12', '9:40 PM']);
  });

  it('counts back for hands with no recorded time', () => {
    expect(stackHistoryEnds({ chipHistory: [1, 2, 3] }, now)).toEqual(['2 hands ago', 'Latest']);
  });

  it('adds the year for a hand from a previous year', () => {
    expect(shortWhen(new Date(2025, 0, 3).getTime(), now)).toBe('Jan 3, 2025');
  });
});
