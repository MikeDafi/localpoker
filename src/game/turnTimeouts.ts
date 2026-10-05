/**
 * Taking a player off the table after they stop answering.
 *
 * A seat that never acts is worse than an empty one. Every one of its turns
 * costs the table the full clock, and the hand only moves on because the host
 * acts on that player's behalf, so everybody else sits through the countdown
 * for a decision nobody made. One or two is somebody walking to the kitchen.
 * Five in a row is somebody who has gone.
 *
 * Counted per player and reset by any action they actually take, so a player
 * who times out twice, acts, then times out twice more is not creeping
 * towards removal: the count is about having stopped, not about being slow.
 *
 * Kept as a pure reducer rather than a timer so it can be tested, and because
 * the thing that decides a player has gone should not be the same code that
 * draws the countdown.
 */

/** Consecutive missed turns before a seat is given up. */
export const MAX_CONSECUTIVE_TIMEOUTS = 5;

export type TimeoutCounts = Readonly<Record<string, number>>;

/**
 * Record a turn that ran out of time.
 *
 * Returns a new map rather than mutating, so this can sit in React state and
 * be compared by identity.
 */
export function noteTimeout(counts: TimeoutCounts, playerId: string): TimeoutCounts {
  if (!playerId) return counts;
  return { ...counts, [playerId]: (counts[playerId] ?? 0) + 1 };
}

/**
 * Record a turn the player actually took.
 *
 * Deliberately clears rather than decrements. Acting is proof they are there,
 * and a player who is present should not be carrying credit for having been
 * absent earlier in the session.
 */
export function noteActed(counts: TimeoutCounts, playerId: string): TimeoutCounts {
  if (!playerId || !(playerId in counts)) return counts;
  const next = { ...counts };
  delete next[playerId];
  return next;
}

/** Whether this player has now missed enough turns to lose the seat. */
export function hasAbandonedTable(counts: TimeoutCounts, playerId: string): boolean {
  return (counts[playerId] ?? 0) >= MAX_CONSECUTIVE_TIMEOUTS;
}

/**
 * Everyone who has stopped answering, so a caller can remove them in one pass.
 *
 * Sorted, because the order a table is reconciled in should not depend on the
 * order keys happen to come out of an object.
 */
export function abandonedPlayers(counts: TimeoutCounts): string[] {
  return Object.keys(counts)
    .filter((id) => hasAbandonedTable(counts, id))
    .sort();
}

/** Forget a player entirely, for when they leave or the table resets. */
export function forgetTimeouts(counts: TimeoutCounts, playerId: string): TimeoutCounts {
  return noteActed(counts, playerId);
}
