/**
 * Deciding whether somebody has actually gone, or just blinked.
 *
 * Two things were folding players who had not folded.
 *
 * The first was a coercion at the call site: the room roster was read with
 * `?.connected === true`, which turns a *missing* flag into a confident
 * `false`. The sync code is careful to treat only an explicit `false` as
 * disconnected, precisely so that "we do not know yet" cannot cost somebody a
 * hand, and that care was thrown away one line before it was consulted. Any
 * moment the roster had not got a `connected` field yet, everybody at the
 * table read as gone.
 *
 * The second is that `onDisconnect` fires on any dropped socket. On a phone
 * that includes a two second blip walking between rooms, so a player sitting
 * there about to act was folded and reconnected immediately afterwards with
 * the hand already lost.
 *
 * So: unknown stays unknown, and a genuine disconnection has to persist
 * before the table acts on it.
 */

/**
 * How long somebody must stay unreachable before the table believes it.
 *
 * Comfortably longer than a mobile hiccup and comfortably shorter than the
 * default turn clock, so a player who really has gone is still folded by the
 * clock rather than holding the table up.
 */
export const DISCONNECT_GRACE_MS = 12_000;

export interface ConnectionReading {
  /** What to report to the game state: `false` only once we are sure. */
  connected: boolean | undefined;
  /** When this player was first seen unreachable, carried to the next read. */
  since: number | undefined;
}

export function readConnection(input: {
  /** The raw `connected` field off the roster, which may be missing. */
  raw: unknown;
  /** When this player was first seen unreachable, from the previous read. */
  since: number | undefined;
  now: number;
  graceMs?: number;
}): ConnectionReading {
  const { raw, since, now } = input;
  const graceMs = input.graceMs ?? DISCONNECT_GRACE_MS;

  // Anything that is not a boolean is a roster we cannot read, not a player
  // who left. Forget any countdown, because we have no evidence they are gone.
  if (typeof raw !== 'boolean') return { connected: undefined, since: undefined };

  if (raw) return { connected: true, since: undefined };

  const first = since ?? now;
  // Still inside the grace window, so report it as unknown rather than as
  // gone. Unknown is what stops the fold.
  if (now - first < graceMs) return { connected: undefined, since: first };
  return { connected: false, since: first };
}
