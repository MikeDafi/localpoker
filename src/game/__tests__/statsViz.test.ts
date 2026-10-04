import { describe, expect, it } from 'vitest';
import { DEFAULT_STATS, type Stats } from '../stats';
import {
  buildHandSwings,
  buildStatsViz,
  buildWinBreakdown,
  classifyPlayingStyle,
} from '../statsViz';

function stats(overrides: Partial<Stats> = {}): Stats {
  return { ...DEFAULT_STATS, ...overrides };
}

describe('stats visualization data', () => {
  it('returns calm empty states for zero hands', () => {
    const viz = buildStatsViz(DEFAULT_STATS);

    expect(viz.winBreakdown.hasData).toBe(false);
    expect(viz.rateBars.hasData).toBe(false);
    expect(viz.playingStyle.hasData).toBe(false);
    expect(viz.handSwings.hasData).toBe(false);
    expect(viz.chipHighlights.hasData).toBe(false);
    expect(viz.winBreakdown.total).toBe(0);
    expect(viz.winBreakdown.segments.every((segment) => segment.value === 0 && segment.share === 0)).toBe(true);
    expect(viz.handSwings.best).toBeNull();
    expect(viz.handSwings.worst).toBeNull();
  });

  it('keeps a single hand from inventing a swing', () => {
    const viz = buildStatsViz(stats({
      handsPlayed: 1,
      handsWon: 1,
      showdownsSeen: 1,
      showdownsWon: 1,
      biggestPotWon: 240,
      netChips: 120,
      chipHistory: [1120],
    }));

    expect(viz.winBreakdown.hasData).toBe(true);
    expect(viz.winBreakdown.segments.map((segment) => segment.value)).toEqual([1, 0, 0]);
    expect(viz.handSwings.hasData).toBe(false);
    expect(viz.handSwings.observedStacks).toBe(1);
    expect(viz.handSwings.swings).toEqual([]);
    expect(viz.handSwings.best).toBeNull();
    expect(viz.handSwings.worst).toBeNull();
  });

  it('clamps win breakdown values when counters disagree', () => {
    const tooManyShowdownWins = buildWinBreakdown(stats({ handsPlayed: 3, handsWon: 1, showdownsWon: 4 }));
    expect(tooManyShowdownWins.segments.map((segment) => segment.value)).toEqual([1, 0, 2]);
    expect(tooManyShowdownWins.segments.every((segment) => segment.value >= 0)).toBe(true);

    const tooManyWins = buildWinBreakdown(stats({ handsPlayed: 2, handsWon: 5, showdownsWon: 1 }));
    expect(tooManyWins.segments.map((segment) => segment.value)).toEqual([1, 1, 0]);
    expect(tooManyWins.segments.reduce((sum, segment) => sum + segment.value, 0)).toBe(2);
  });

  it('computes recent swings from consecutive stack entries', () => {
    const swings = buildHandSwings([1000, 1125, 1090, 1090, 1210], 3);

    expect(swings.hasData).toBe(true);
    expect(swings.swings).toEqual([125, -35, 0, 120]);
    expect(swings.recent).toEqual([-35, 0, 120]);
    expect(swings.best).toBe(125);
    expect(swings.worst).toBe(-35);
    expect(swings.maxAbs).toBe(125);
  });

  it('classifies playing style on quadrant boundaries', () => {
    expect(classifyPlayingStyle(30, 14)).toBe('tightPassive');
    expect(classifyPlayingStyle(30, 15)).toBe('tightAggressive');
    expect(classifyPlayingStyle(31, 14)).toBe('loosePassive');
    expect(classifyPlayingStyle(31, 15)).toBe('looseAggressive');
  });
});
