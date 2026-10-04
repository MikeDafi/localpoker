import {
  STANDARD_STRUCTURE,
  TURBO_STRUCTURE,
  blindsDue,
  levelAt,
  type BlindLevel,
  type LevelState,
  type TournamentStructure,
} from './tournament';

export type GameMode = 'cash' | 'tournament' | 'turbo';

export const GAME_MODE_OPTIONS = [
  { value: 'cash', label: 'Cash', hint: 'Rebuy allowed' },
  { value: 'tournament', label: 'Tournament', hint: 'No rebuy' },
  { value: 'turbo', label: 'Turbo', hint: 'Fast levels' },
] satisfies { value: GameMode; label: string; hint: string }[];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  cash: 'Cash',
  tournament: 'Tournament',
  turbo: 'Turbo',
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
}): LevelState | null {
  const structure = tournamentStructureForMode(input.mode);
  if (!structure || typeof input.startedAt !== 'number') return null;
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
  const level = `L${status.levelNumber} ${formatBlindLevel(status.level)}`;
  const suffix = status.msUntilNextLevel === null
    ? 'final level'
    : `up in ${formatLevelClock(status.msUntilNextLevel)}`;
  return status.pendingForNextHand
    ? `${level} next hand · ${suffix}`
    : `${level} · ${suffix}`;
}
