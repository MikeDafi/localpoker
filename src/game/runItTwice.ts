/**
 * Running a board more than once.
 *
 * When everyone left is all in there is no more betting, so the rest of the
 * board is a coin flip nobody can influence. Dealing it two or three times and
 * splitting the pot between the results is how that flip gets made less
 * brutal without changing anybody's equity: over many runs each player still
 * wins exactly their share, they just stop losing the whole stack to one card.
 *
 * Two decisions live here, and both are rules rather than rendering, so both
 * are tested rather than trusted.
 */

/** Nobody is allowed to ask for more than this many boards. */
export const MAX_RUNS = 3;

export type RunCount = 1 | 2 | 3;

export interface RunVote {
  playerId: string;
  /** What they asked for, or null if they have not answered yet. */
  choice: RunCount | null;
  isBot: boolean;
}

/**
 * How many times the board actually gets run.
 *
 * The highest number anybody asks for wins. That is a house rule rather than
 * the usual one, which needs everybody to agree and otherwise runs once, and
 * it has a consequence worth being honest about: running more times lowers
 * variance, so the most cautious player at the table always gets their way and
 * somebody who wants the gamble can never have it.
 *
 * Bots do not get an opinion. They would otherwise decide it between
 * themselves every time a human was not involved, and a bot cannot want
 * anything about variance. When it is bots only, it runs once, because there
 * is nobody there to be protected from a bad river.
 */
export function agreedRuns(votes: readonly RunVote[]): RunCount {
  const human = votes.filter((v) => !v.isBot);
  if (human.length === 0) return 1;
  const asked = human
    .map((v) => v.choice)
    .filter((c): c is RunCount => c !== null);
  if (asked.length === 0) return 1;
  return Math.min(MAX_RUNS, Math.max(...asked)) as RunCount;
}

/** Whether everybody who gets a say has said something. */
export function votingComplete(votes: readonly RunVote[]): boolean {
  const human = votes.filter((v) => !v.isBot);
  return human.length === 0 || human.every((v) => v.choice !== null);
}

/**
 * Cut a pot into one share per run.
 *
 * Chips are integers, so a pot rarely divides evenly and the remainder has to
 * go somewhere deterministic. It goes to the earliest runs, which keeps the
 * total exact and means the same pot always splits the same way rather than
 * depending on who happened to win which board.
 *
 * The total is asserted by test rather than by hope: a split that loses or
 * invents a chip is a split that quietly changes somebody's stack.
 */
export function splitPotAcrossRuns(pot: number, runs: number): number[] {
  if (!Number.isFinite(pot) || pot <= 0) return [];
  const n = Math.max(1, Math.min(MAX_RUNS, Math.floor(runs)));
  const base = Math.floor(pot / n);
  let remainder = pot - base * n;
  const shares: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    shares.push(base + extra);
  }
  return shares;
}

/**
 * Whether the board can be run more than once at all.
 *
 * Only with at least two players still in, everybody who is left all in so no
 * further betting is possible, and a card still to come. Offering it when
 * somebody can still act would let a player buy information about how the
 * board will be dealt before deciding whether to call.
 */
export function canRunItTwice(input: {
  /** Players still in the hand, not folded. */
  contesting: readonly { allIn?: boolean; chips: number }[];
  /** Cards already on the board. */
  boardLength: number;
}): boolean {
  if (input.contesting.length < 2) return false;
  if (input.boardLength >= 5) return false;
  const canStillAct = input.contesting.filter((p) => !p.allIn && p.chips > 0);
  return canStillAct.length <= 1;
}
