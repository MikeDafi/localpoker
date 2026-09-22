import type { SavedGame } from '../state/AppContext';

/** A friends/online game is abandoned once everyone leaves; don't resume a stale one. */
export const STALE_FRIENDS_RESUME_MS = 15_000;

/**
 * Whether a saved game may be resumed. Local (vs-bots) games are always
 * resumable. A friends-room game (has a roomCode) is NOT resumable once it's
 * older than 15s, because a real-time table won't have waited for you.
 */
export function isResumable(saved: SavedGame | null | undefined, now: number = Date.now()): boolean {
  if (!saved) return false;
  if (saved.roomCode) {
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
 * This only works if `savedAt` is stamped when the player actually leaves — the
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
