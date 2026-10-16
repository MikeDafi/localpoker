import { describe, expect, it } from 'vitest';

import {
  formatLevelClock,
  formatTournamentStatus,
  initialBlindLevelForMode,
  isGameMode,
  isTournamentMode,
  tournamentStructureForMode,
  tournamentTableStatus,
} from '../gameMode';
import { STANDARD_STRUCTURE } from '../tournament';

describe('game modes', () => {
  it('keeps cash as the non-tournament mode', () => {
    expect(isGameMode('cash')).toBe(true);
    expect(isTournamentMode('cash')).toBe(false);
    expect(tournamentStructureForMode('cash')).toBeNull();
  });

  it('maps the tournament mode to its tested structure', () => {
    expect(tournamentStructureForMode('tournament')).toBe(STANDARD_STRUCTURE);
  });

  // Turbo was removed. A table or saved setup from before still says it, and
  // it was a tournament, so it must not quietly turn into a cash game.
  it('treats a leftover turbo as a tournament', () => {
    expect(isGameMode('turbo')).toBe(false);
    expect(tournamentStructureForMode('turbo' as never)).toBe(STANDARD_STRUCTURE);
  });

  it('starts tournament hands on the first structure level', () => {
    expect(initialBlindLevelForMode('tournament')).toEqual(STANDARD_STRUCTURE.levels[0]);
    expect(initialBlindLevelForMode('cash')).toBeNull();
  });
});

describe('tournament table status', () => {
  it('derives the level from a published start time', () => {
    const startedAt = 1_000;
    const status = tournamentTableStatus({
      mode: 'tournament',
      startedAt,
      now: startedAt + STANDARD_STRUCTURE.levelMs + 5000,
      currentBlinds: STANDARD_STRUCTURE.levels[1],
    });

    expect(status?.levelNumber).toBe(2);
    expect(status?.level).toEqual(STANDARD_STRUCTURE.levels[1]);
  });

  it('marks a level that arrived mid hand as pending for the next hand', () => {
    const startedAt = 20_000;
    const status = tournamentTableStatus({
      mode: 'tournament',
      startedAt,
      now: startedAt + STANDARD_STRUCTURE.levelMs,
      currentBlinds: STANDARD_STRUCTURE.levels[0],
    });

    expect(status?.pendingForNextHand).toBe(true);
    expect(formatTournamentStatus(status!)).toContain('next hand');
  });

  /*
   * The owner asked for no time remaining on a tournament, and the clock was
   * not merely redundant: levels advance on the shared hand number, so a wall
   * clock counted down to something it had no part in. The fallback was the
   * last way one could still appear, on a table whose level length never got
   * written, which is now the table most likely to be made since the setting
   * only exists in the table's own menu.
   */
  it('never shows a clock on a tournament, even with no level length set', () => {
    for (const mode of ['tournament'] as const) {
      const status = tournamentTableStatus({
        mode,
        startedAt: 1_000,
        now: 1_000 + STANDARD_STRUCTURE.levelMs * 3,
        currentBlinds: STANDARD_STRUCTURE.levels[0],
        handNumber: 4,
      });
      expect(status?.msUntilNextLevel, `${mode} must not count on a clock`).toBeNull();
      expect(status?.handsUntilNextLevel).toBeGreaterThan(0);
      expect(formatTournamentStatus(status!)).toContain('hand');
      expect(formatTournamentStatus(status!)).not.toMatch(/\d:\d\d/);
    }
  });

  it('counts the hands it was told about rather than the mode default', () => {
    const status = tournamentTableStatus({
      mode: 'tournament',
      startedAt: 0,
      now: 0,
      currentBlinds: STANDARD_STRUCTURE.levels[0],
      handNumber: 1,
      levelLengthHands: 3,
    });
    expect(status?.handsUntilNextLevel).toBe(3);
  });

  it('formats clocks without going negative', () => {
    expect(formatLevelClock(61_000)).toBe('1:01');
    expect(formatLevelClock(-50)).toBe('0:00');
    expect(formatLevelClock(null)).toBe('final level');
  });
});
