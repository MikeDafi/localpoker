/**
 * Tournament structure: blinds that climb, and a game that ends.
 *
 * A cash game has no ending. You sit down, you play, and at some point
 * somebody has to decide to stop, which is the structural gap in this app: a
 * session just trails off. A tournament ends by itself, because the blinds
 * climb until somebody holds every chip.
 *
 * Two things make that work, and both are here rather than in the screen.
 *
 * The level is derived from **when the tournament started**, not counted down
 * on each device. The host is authoritative and there is no server behind it,
 * so a local countdown drifts between players and resets whenever the host
 * backgrounds the app. Given a start time that the host publishes, every
 * device computes the same level from the same arithmetic, and a phone that
 * was asleep for ten minutes catches up the moment it wakes rather than
 * believing it is still on level one.
 *
 * Busting means out. That is what separates a tournament from a cash game,
 * and it is deliberately not a thing the rebuy window gets a say in.
 */

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  /** Taken from everyone dealt in, on top of the blinds. Zero for early levels. */
  ante: number;
}

export interface TournamentStructure {
  id: string;
  name: string;
  /** How long each level lasts. The last level runs forever. */
  levelMs: number;
  levels: readonly BlindLevel[];
}

const L = (smallBlind: number, bigBlind: number, ante = 0): BlindLevel => ({ smallBlind, bigBlind, ante });

/**
 * A climb that roughly doubles each level, with antes arriving once the
 * blinds are big enough to be worth stealing.
 *
 * Doubling is what a real structure does, because a flat climb stops
 * mattering relative to the stacks almost immediately. Antes start at level
 * four rather than level one so the early game is not dominated by a forced
 * bet nobody has chips to contest.
 */
const CLIMB: readonly BlindLevel[] = [
  L(10, 20), L(15, 30), L(25, 50), L(50, 100, 10), L(75, 150, 15),
  L(100, 200, 25), L(150, 300, asAnte(300)), L(200, 400, asAnte(400)),
  L(300, 600, asAnte(600)), L(500, 1000, asAnte(1000)),
  L(750, 1500, asAnte(1500)), L(1000, 2000, asAnte(2000)),
];

/** An ante of a tenth of the big blind, rounded to something countable. */
function asAnte(bigBlind: number): number {
  return Math.max(1, Math.round(bigBlind / 10));
}

export const STANDARD_STRUCTURE: TournamentStructure = {
  id: 'standard',
  name: 'Tournament',
  levelMs: 10 * 60 * 1000,
  levels: CLIMB,
};

/**
 * The same climb at a third of the time.
 *
 * Turbo is the same ladder taken faster rather than a steeper one, because a
 * steeper ladder changes which hands are worth playing and a faster clock
 * only changes how soon.
 */
export const TURBO_STRUCTURE: TournamentStructure = {
  id: 'turbo',
  name: 'Turbo',
  levelMs: 200 * 1000,
  levels: CLIMB,
};

export const STRUCTURES: Record<string, TournamentStructure> = {
  [STANDARD_STRUCTURE.id]: STANDARD_STRUCTURE,
  [TURBO_STRUCTURE.id]: TURBO_STRUCTURE,
};

export interface LevelState {
  /** Zero based, so level 0 is what a player is told is "Level 1". */
  index: number;
  level: BlindLevel;
  /** Null on the final level, which does not end. */
  msUntilNextLevel: number | null;
  /** What the blinds become next, for the warning on the table. */
  nextLevel: BlindLevel | null;
}

/**
 * Which level a tournament is on, given how long it has been running.
 *
 * Takes elapsed milliseconds rather than reading a clock, so it is pure and
 * so a caller can feed it a figure derived from a published start time.
 * Negative or nonsense elapsed values resolve to the first level rather than
 * throwing, because a clock that is briefly wrong must not end the game.
 */
export function levelAt(structure: TournamentStructure, elapsedMs: number): LevelState {
  const levels = structure.levels;
  const last = levels.length - 1;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || structure.levelMs <= 0) {
    return { index: 0, level: levels[0], msUntilNextLevel: structure.levelMs, nextLevel: levels[1] ?? null };
  }

  const raw = Math.floor(elapsedMs / structure.levelMs);
  const index = Math.min(raw, last);
  if (index >= last) {
    // The last level runs to the end, so there is nothing to count down to.
    return { index: last, level: levels[last], msUntilNextLevel: null, nextLevel: null };
  }
  return {
    index,
    level: levels[index],
    msUntilNextLevel: structure.levelMs - (elapsedMs - index * structure.levelMs),
    nextLevel: levels[index + 1],
  };
}

/**
 * Whether the tournament is over, and who took it.
 *
 * One player with chips ends it. Everyone having nothing cannot happen in a
 * real hand, but a corrupt or half written state must resolve to "no winner
 * yet" rather than crowning an arbitrary seat.
 */
export function tournamentWinner(
  players: readonly { id: string; chips: number }[],
): string | null {
  const alive = players.filter((p) => p.chips > 0);
  return alive.length === 1 ? alive[0].id : null;
}

/**
 * Whether somebody is out for good.
 *
 * In a tournament, no chips means no seat: there is no rebuy to come back on,
 * which is the entire difference from a cash game. Kept as a function so the
 * rebuy window has one place to ask rather than testing the mode itself in
 * several.
 */
export function isEliminated(player: { chips: number }, tournament: boolean): boolean {
  return tournament && player.chips <= 0;
}
