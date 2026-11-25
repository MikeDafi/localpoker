/**
 * Keeping a hand that was just turned over on the table long enough to see.
 *
 * Build 67: the host lost a contested river, flipped, and the guest never saw
 * the cards. The cards did reach the guest. The flip writes `shown` and
 * `exposed`, the host republishes with both cards in public state, and the
 * guest's showdown row draws them; each of those steps is pinned by a test.
 * What took them away was the next hand, which clears every exposure, dealt
 * before anybody had looked:
 *
 * - The host deals the moment it has asked and every guest is ready. The
 *   winner had already tapped Next Hand, so the host flipping and then
 *   tapping Next Hand itself dealt within a second, with the flipped cards
 *   still mid-flight on the guest's screen.
 * - Showing was meant to restart the host's end-of-hand countdown, but the
 *   restart was keyed on a constant: the hold was set to the same three
 *   seconds by every `shown` event, including the empty one the listener
 *   delivers on subscribing and the clear at every new hand. So in most hands
 *   the hold was already three when the flip came, nothing changed, and the
 *   countdown ran out on its original schedule.
 *
 * A reveal is now a moment, not a flag: it records when it happened, the
 * countdown restarts on each one, and the deal waits until the most recent
 * one has been on screen for `REVEAL_VISIBLE_MS`.
 */

import { REVEAL_LAYOUT_MS } from './showdownLayout';

/**
 * How long a reveal holds the next deal.
 *
 * The flipped cards travel from the seat to the row under the board, which
 * takes `REVEAL_LAYOUT_MS`, and the guest's copy starts that journey a round
 * trip after the host's. Two more seconds on top is enough to read two cards,
 * and short enough that a host tapping Next Hand barely notices the wait.
 */
export const REVEAL_VISIBLE_MS = REVEAL_LAYOUT_MS + 2_000;

export type RevealHold = { hand: number; at: number } | null;

/** A hand was turned over (in whole or in part) at `now`. */
export function noteReveal(hand: number, now: number): RevealHold {
  return { hand, at: now };
}

/**
 * Whether a `shown` update is a reveal at all.
 *
 * The listener fires with an empty list when it subscribes and again when the
 * host clears the node for a new hand. Neither shows anybody anything, and
 * treating them as reveals is what used up the countdown restart before a
 * real flip could use it.
 */
export function isReveal(playerIds: readonly string[]): boolean {
  return playerIds.length > 0;
}

/** Milliseconds the deal must still wait for this hand's last reveal, 0 if none. */
export function revealHoldLeftMs(hold: RevealHold, hand: number, now: number, visibleMs = REVEAL_VISIBLE_MS): number {
  if (!hold || hold.hand !== hand) return 0;
  return Math.max(0, hold.at + visibleMs - now);
}

/**
 * Restart key for the end-of-hand countdown.
 *
 * Changes on every reveal in this hand, so each flip restarts the clock, and
 * is stable otherwise, so the clock is not restarted by unrelated renders.
 */
export function revealCountdownKey(hold: RevealHold, hand: number): string {
  return hold && hold.hand === hand ? `${hand}-${hold.at}` : `${hand}-0`;
}
