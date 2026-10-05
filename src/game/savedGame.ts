import type { SavedGame } from '../state/AppContext';

/** A friends/online game is abandoned once everyone leaves; don't resume a stale one. */
export const STALE_FRIENDS_RESUME_MS = 15_000;

export const nextSavedGameWriteVersion = (current: number): number =>
  Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;

export const isCurrentSavedGameWrite = (writeVersion: number, currentVersion: number): boolean =>
  writeVersion === currentVersion;

/**
 * Whether a saved game may be resumed. Local (vs-bots) games are always
 * resumable.
 *
 * A friends-room game is the interesting case. The rule used to be that it
 * went stale after 15 seconds, on the reasoning that a real-time table will
 * not have waited for you. That is true when you were dropped, and wrong when
 * you stepped away on purpose: the host's device *is* the table, so a host who
 * walks to the home screen has not ended anything, and a guest's seat is still
 * theirs. The 15 second rule was quietly the reason that going back and
 * returning left people with no way in.
 *
 * So a deliberate step away stays resumable with no deadline. Whether the room
 * is actually still there is a question only the room can answer, and the
 * table screen already asks it and says so, which is a better place for the
 * answer than a guess made from a timestamp.
 */
export function isResumable(saved: SavedGame | null | undefined, now: number = Date.now()): boolean {
  if (!saved) return false;
  if (saved.roomCode) {
    if (saved.steppedAway) return true;
    return now - saved.savedAt <= STALE_FRIENDS_RESUME_MS;
  }
  return true;
}

/**
 * The `turnStartedAt` a resumed table should adopt.
 *
 * The countdown is paused while you're away: we carry over how long the turn had
 * *already* been running when the game was saved, and restart from that point.
 * Returning `now` (a full-length timer) is the fallback when there's nothing to
 * carry over.
 *
 * This only works if `savedAt` is stamped when the player actually leaves, the
 * debounced autosave stamps it ~600ms into the turn, which made every resume
 * look like the turn had barely started. TableScreen therefore flushes a save on
 * unmount.
 */
export function resumedTurnStartedAt(
  saved: SavedGame | null | undefined,
  now: number = Date.now(),
): number {
  if (!saved?.turnStartedAt) return now;
  const elapsed = Math.max(0, (saved.savedAt ?? now) - saved.turnStartedAt);
  return now - elapsed;
}
