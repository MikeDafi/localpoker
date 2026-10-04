/**
 * Walking a showdown, one hand at a time.
 *
 * The table used to turn every hand over at once, which skips the part of a
 * showdown that actually matters. Hands are shown in turn, and because each
 * player can see what is already face up, a beaten hand can be thrown away
 * instead of published to everyone who will be playing against them all
 * night. That decision is the reason the order exists.
 *
 * Kept as a reducer rather than as state inside the table, because the
 * sequencing is the part worth testing: who is asked, in what order, and what
 * is on the table by the time each of them has to decide.
 */

import type { ShowdownOrder } from './showdownOrder';
import { canMuck } from './showdownOrder';

export interface RevealProgress {
  /** Position in the order of the player yet to decide. */
  index: number;
  /** Hands face up, in the order they were tabled. */
  shown: string[];
  /** Hands thrown away unseen. */
  mucked: string[];
}

export const startReveal = (): RevealProgress => ({ index: 0, shown: [], mucked: [] });

/** Who has to decide next, or null once every hand has been resolved. */
export function pendingPlayer(order: ShowdownOrder, progress: RevealProgress): string | null {
  return progress.index < order.order.length ? order.order[progress.index] : null;
}

export function revealComplete(order: ShowdownOrder, progress: RevealProgress): boolean {
  return pendingPlayer(order, progress) === null;
}

/**
 * Resolve the player at the cursor and move on.
 *
 * `show` is only a request. A hand that is not allowed to muck is tabled
 * whatever was asked for, which is what stops a winner from collecting a pot
 * nobody ever saw.
 */
export function advanceReveal(
  order: ShowdownOrder,
  progress: RevealProgress,
  show: boolean,
): RevealProgress {
  const playerId = pendingPlayer(order, progress);
  if (playerId === null) return progress;
  const tabled = show || !canMuck(order, playerId);
  return {
    index: progress.index + 1,
    shown: tabled ? [...progress.shown, playerId] : progress.shown,
    mucked: tabled ? progress.mucked : [...progress.mucked, playerId],
  };
}

/**
 * Whether the table is waiting on a person rather than on a bot.
 *
 * A forced show is not a decision, so it does not stop for anybody: the hero
 * is only asked when there is a real choice to make.
 */
export function awaitingChoiceFrom(
  order: ShowdownOrder,
  progress: RevealProgress,
  localPlayerId: string,
): boolean {
  const pending = pendingPlayer(order, progress);
  return pending === localPlayerId && canMuck(order, pending);
}
