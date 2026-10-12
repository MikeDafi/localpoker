import {
  STANDARD_STRUCTURE,
  TURBO_STRUCTURE,
  blindsDue,
  levelAt,
  handsUntilNextLevel,
  levelAtHand,
  type BlindLevel,
  type LevelState,
  type TournamentStructure,
} from './tournament';

export type GameMode = 'cash' | 'tournament' | 'turbo';

/**
 * How many hands a blind level lasts, per mode.
 *
 * Kept here beside the mode rather than in `settings`, because the status
 * line below has to be able to fall back to it and `settings` imports this
 * file rather than the other way round. `settings` re-exports it, so nothing
 * that already reads it from there has to change.
 */
export const BLIND_LEVEL_LENGTH_HANDS_BY_MODE: Record<GameMode, number> = {
  cash: 0,
  tournament: 10,
  turbo: 4,
};

export function defaultBlindLevelLengthHands(mode: GameMode): number {
  return BLIND_LEVEL_LENGTH_HANDS_BY_MODE[mode];
}

/*
 * "Turbo" means nothing on its own.
 *
 * It is jargon from live poker, and the hint under it, "Fast levels", only
 * makes sense to somebody who already knows a tournament has levels. Both
 * tournament modes now say they are tournaments and say what the difference
 * between them is, which is how quickly the blinds climb.
 */
export const GAME_MODE_OPTIONS = [
  { value: 'cash', label: 'Cash', hint: 'Fixed blinds, rebuy any time' },
  { value: 'tournament', label: 'Tournament', hint: 'Blinds climb, bust and you are out' },
  { value: 'turbo', label: 'Turbo Tournament', hint: 'Same, blinds climb twice as fast' },
] satisfies { value: GameMode; label: string; hint: string }[];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  cash: 'Cash',
  tournament: 'Tournament',
  turbo: 'Turbo Tournament',
};

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && GAME_MODE_OPTIONS.some((option) => option.value === value);
}

/**
 * The mode's ladder, started at the small blind the table was set up with.
 *
 * Setup always said tournaments use the blinds as level one, and nothing did:
 * the ladder began at 10/20 whatever was picked. Every rung is scaled by the
 * same factor, so the shape of the climb is the mode's and only its size is
 * the table's. Omitted, or already the ladder's own start, the ladder is
 * returned untouched.
 */
export function tournamentStructureForMode(mode: GameMode, startSmallBlind?: number): TournamentStructure | null {
  const structure = mode === 'tournament' ? STANDARD_STRUCTURE : mode === 'turbo' ? TURBO_STRUCTURE : null;
  if (!structure) return null;
  const base = structure.levels[0].smallBlind;
  if (typeof startSmallBlind !== 'number' || !Number.isFinite(startSmallBlind) || startSmallBlind < 1) return structure;
  const start = Math.round(startSmallBlind);
  if (start === base) return structure;
  const factor = start / base;
  return {
    ...structure,
    levels: structure.levels.map((level) => {
      const smallBlind = Math.max(1, Math.round(level.smallBlind * factor));
      return {
        smallBlind,
        bigBlind: smallBlind * 2,
        ante: level.ante > 0 ? Math.max(1, Math.round(level.ante * factor)) : 0,
      };
    }),
  };
}

export interface BlindSchedulePreviewRow {
  fromHand: number;
  /** Null on the final level, which does not end. */
  toHand: number | null;
  level: BlindLevel;
}

/**
 * The first few levels a tournament will climb, for Game Setup to show under
 * the level length.
 *
 * Built from `levelAtHand`, the same function the table deals from, so the
 * preview cannot drift from what is actually dealt.
 */
export function blindSchedulePreview(
  mode: GameMode,
  levelLengthHands: number,
  count = 4,
  startSmallBlind?: number,
): BlindSchedulePreviewRow[] {
  const structure = tournamentStructureForMode(mode, startSmallBlind);
  const length = Number.isFinite(levelLengthHands) ? Math.floor(levelLengthHands) : 0;
  if (!structure || length <= 0) return [];
  const rows: BlindSchedulePreviewRow[] = [];
  for (let i = 0; i < Math.min(count, structure.levels.length); i += 1) {
    const fromHand = i * length + 1;
    const state = levelAtHand(structure, fromHand, length);
    rows.push({ fromHand, toHand: state.nextLevel ? fromHand + length - 1 : null, level: state.level });
  }
  return rows;
}

/** One line for setup: "Hands 1-10: 10/20 · 11-20: 15/30 · ...". */
export function formatBlindSchedulePreview(rows: readonly BlindSchedulePreviewRow[]): string {
  return rows.map((row, i) => {
    const hands = row.toHand === null ? `${row.fromHand}+` : `${row.fromHand}-${row.toHand}`;
    const blinds = `${row.level.smallBlind}/${row.level.bigBlind}${row.level.ante > 0 ? ` +${row.level.ante} ante` : ''}`;
    return `${i === 0 ? 'Hands ' : ''}${hands}: ${blinds}`;
  }).join(' · ');
}

export function isTournamentMode(mode: GameMode): boolean {
  return tournamentStructureForMode(mode) !== null;
}

export function initialBlindLevelForMode(mode: GameMode): BlindLevel | null {
  return tournamentStructureForMode(mode)?.levels[0] ?? null;
}

export function tournamentLevelForMode(input: {
  mode: GameMode;
  startedAt: number | null | undefined;
  now: number;
  /** The hand about to be dealt, one based. Only read when counting hands. */
  handNumber?: number;
  /**
   * Hands per level. Above zero this replaces the clock entirely.
   *
   * Two ways up the same ladder: the clock is what a real tournament uses,
   * and hands are what a game played in snatched minutes needs, because a
   * level that advances while the phone is in a pocket raises the blinds past
   * the stacks with no poker played in between.
   */
  levelLengthHands?: number;
  /** Level one's small blind, which the whole ladder is scaled from. */
  startSmallBlind?: number;
}): LevelState | null {
  const structure = tournamentStructureForMode(input.mode, input.startSmallBlind);
  if (!structure) return null;
  const byHand = typeof input.levelLengthHands === 'number' && input.levelLengthHands > 0;
  if (byHand) return levelAtHand(structure, input.handNumber ?? 1, input.levelLengthHands!);
  if (typeof input.startedAt !== 'number') return null;
  return levelAt(structure, input.now - input.startedAt);
}

export function blindsForMode(
  mode: GameMode,
  fallback: { smallBlind: number; bigBlind: number; ante?: number },
): BlindLevel {
  return initialBlindLevelForMode(mode) ?? {
    smallBlind: fallback.smallBlind,
    bigBlind: fallback.bigBlind,
    ante: fallback.ante ?? 0,
  };
}

/** A tournament wants real play in it, so the stack is sized in big blinds. */
export const TOURNAMENT_STARTING_BIG_BLINDS = 100;

/**
 * What picking a mode does to the rest of the table.
 *
 * A tournament is not a cash game with a flag set on it: it has a published
 * ladder. The ladder is scaled to start at the table's own blinds, so the
 * blinds stay where they were and only the ante moves to the first rung's.
 *
 * The stack moves with them. Blinds mean nothing on their own; what decides
 * whether a tournament has any play in it is how many big blinds people sit
 * down with, so a stack that would leave everyone nearly all in on level one
 * is raised to a hundred big blinds. A deeper stack than that is left alone,
 * because wanting a deep tournament is a reasonable thing to want.
 *
 * Switching back to cash deliberately changes nothing. The blinds are then
 * the player's to choose, and quietly resetting them would throw away a table
 * somebody had set up.
 */
export function settingsForMode<
  T extends { gameMode: GameMode; smallBlind: number; bigBlind: number; ante: number; startingStack: number },
>(settings: T, mode: GameMode): T {
  // The ladder starts wherever the table's blinds already are, so picking a
  // tournament no longer throws away the blinds somebody chose.
  const level = tournamentStructureForMode(mode, settings.smallBlind)?.levels[0] ?? null;
  if (!level) return { ...settings, gameMode: mode };
  const floor = level.bigBlind * TOURNAMENT_STARTING_BIG_BLINDS;
  return {
    ...settings,
    gameMode: mode,
    smallBlind: level.smallBlind,
    bigBlind: level.bigBlind,
    ante: level.ante,
    startingStack: Math.max(settings.startingStack, floor),
  };
}

export interface TournamentTableStatus {
  mode: GameMode;
  levelNumber: number;
  level: BlindLevel;
  msUntilNextLevel: number | null;
  /** Hands until the blinds climb, when the ladder is counted in hands. */
  handsUntilNextLevel?: number | null;
  nextLevel: BlindLevel | null;
  pendingForNextHand: boolean;
}

export function tournamentTableStatus(input: {
  mode: GameMode;
  startedAt: number | null | undefined;
  now: number;
  currentBlinds: { smallBlind: number; bigBlind: number; ante?: number };
  handNumber?: number;
  levelLengthHands?: number;
  startSmallBlind?: number;
}): TournamentTableStatus | null {
  const level = tournamentLevelForMode(input);
  if (!level) return null;
  /*
   * A tournament ALWAYS counts in hands, never on a clock.
   *
   * The clock was not simply redundant, it was lying: levels advance on the
   * shared hand number, so a wall clock counted down to a change it had no
   * part in, and two people at the same table watched different numbers.
   * Falling back to it when the level length was missing put that lie back
   * for exactly the tables most likely to hit it, so the mode's own default
   * is used instead. The clock survives only for a structure that really is
   * timed, which no mode currently is.
   */
  const lengthHands = typeof input.levelLengthHands === 'number' && input.levelLengthHands > 0
    ? input.levelLengthHands
    : defaultBlindLevelLengthHands(input.mode);
  const byHand = lengthHands > 0;
  return {
    mode: input.mode,
    levelNumber: level.index + 1,
    level: level.level,
    msUntilNextLevel: byHand ? null : level.msUntilNextLevel,
    handsUntilNextLevel: byHand && level.nextLevel
      ? handsUntilNextLevel(input.handNumber ?? 1, lengthHands)
      : null,
    nextLevel: level.nextLevel,
    pendingForNextHand: blindsDue(input.currentBlinds, level.level),
  };
}

export function formatBlindLevel(level: BlindLevel): string {
  return level.ante > 0
    ? `${level.smallBlind}/${level.bigBlind}/${level.ante}`
    : `${level.smallBlind}/${level.bigBlind}`;
}

export function formatLevelClock(ms: number | null): string {
  if (ms === null) return 'final level';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatTournamentStatus(status: TournamentTableStatus): string {
  const level = `Level ${status.levelNumber} ${formatBlindLevel(status.level)}`;
  const hands = status.handsUntilNextLevel;
  const suffix = hands !== null && hands !== undefined
    ? `up in ${hands} ${hands === 1 ? 'hand' : 'hands'}`
    : status.msUntilNextLevel === null
      ? 'final level'
      : `up in ${formatLevelClock(status.msUntilNextLevel)}`;
  return status.pendingForNextHand
    ? `${level} next hand · ${suffix}`
    : `${level} · ${suffix}`;
}
