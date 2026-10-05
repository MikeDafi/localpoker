import {
  STANDARD_STRUCTURE,
  TURBO_STRUCTURE,
  blindsDue,
  levelAt,
  levelAtHand,
  type BlindLevel,
  type LevelState,
  type TournamentStructure,
} from './tournament';

export type GameMode = 'cash' | 'tournament' | 'turbo';

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

export function tournamentStructureForMode(mode: GameMode): TournamentStructure | null {
  if (mode === 'tournament') return STANDARD_STRUCTURE;
  if (mode === 'turbo') return TURBO_STRUCTURE;
  return null;
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
}): LevelState | null {
  const structure = tournamentStructureForMode(input.mode);
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
 * ladder, and the blinds it starts on are the first rung of that ladder rather
 * than whatever the cash game happened to be playing. Choosing the mode and
 * then leaving the table on 50/100 when the ladder starts at 10/20 would mean
 * the first level was a lie.
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
  const level = initialBlindLevelForMode(mode);
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
  nextLevel: BlindLevel | null;
  pendingForNextHand: boolean;
}

export function tournamentTableStatus(input: {
  mode: GameMode;
  startedAt: number | null | undefined;
  now: number;
  currentBlinds: { smallBlind: number; bigBlind: number; ante?: number };
}): TournamentTableStatus | null {
  const level = tournamentLevelForMode(input);
  if (!level) return null;
  return {
    mode: input.mode,
    levelNumber: level.index + 1,
    level: level.level,
    msUntilNextLevel: level.msUntilNextLevel,
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
  const suffix = status.msUntilNextLevel === null
    ? 'final level'
    : `up in ${formatLevelClock(status.msUntilNextLevel)}`;
  return status.pendingForNextHand
    ? `${level} next hand · ${suffix}`
    : `${level} · ${suffix}`;
}
