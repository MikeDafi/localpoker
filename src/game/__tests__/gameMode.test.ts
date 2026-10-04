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
import { STANDARD_STRUCTURE, TURBO_STRUCTURE } from '../tournament';

describe('game modes', () => {
  it('keeps cash as the non-tournament mode', () => {
    expect(isGameMode('cash')).toBe(true);
    expect(isTournamentMode('cash')).toBe(false);
    expect(tournamentStructureForMode('cash')).toBeNull();
  });

  it('maps the two tournament modes to their tested structures', () => {
    expect(tournamentStructureForMode('tournament')).toBe(STANDARD_STRUCTURE);
    expect(tournamentStructureForMode('turbo')).toBe(TURBO_STRUCTURE);
  });

  it('starts tournament hands on the first structure level', () => {
    expect(initialBlindLevelForMode('tournament')).toEqual(STANDARD_STRUCTURE.levels[0]);
    expect(initialBlindLevelForMode('turbo')).toEqual(TURBO_STRUCTURE.levels[0]);
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
      mode: 'turbo',
      startedAt,
      now: startedAt + TURBO_STRUCTURE.levelMs,
      currentBlinds: TURBO_STRUCTURE.levels[0],
    });

    expect(status?.pendingForNextHand).toBe(true);
    expect(formatTournamentStatus(status!)).toContain('next hand');
  });

  it('formats clocks without going negative', () => {
    expect(formatLevelClock(61_000)).toBe('1:01');
    expect(formatLevelClock(-50)).toBe('0:00');
    expect(formatLevelClock(null)).toBe('final level');
  });
});
