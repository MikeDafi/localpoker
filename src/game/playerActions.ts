/**
 * What tapping a player at the table offers you.
 *
 * Pulled out of the screen because it is a rule, not a rendering detail, and
 * it has one part that must never quietly regress: reporting and blocking are
 * safety tools and have to survive whatever else is switched off. Deciding
 * that inside a JSX array meant the only way to check it was to play a hand
 * and tap someone.
 */

export type PlayerTapAction = 'stats' | 'report' | 'block';

export interface PlayerTapInput {
  /** The tapped seat is the local player. */
  self: boolean;
  /** The tapped seat is a bot. */
  bot: boolean;
  /** The Live Stats Overlay setting. */
  showLiveStats: boolean;
}

export function playerTapActions({ self, bot, showLiveStats }: PlayerTapInput): PlayerTapAction[] {
  const stats: PlayerTapAction[] = showLiveStats ? ['stats'] : [];
  /*
   * There is nobody to report in either of these cases: one is you and the
   * other is software. With stats off that leaves nothing at all, which is
   * the point. Tapping used to open the stats panel regardless of the
   * setting, so switching the overlay off hid the button in the corner and
   * changed nothing about the seats.
   */
  if (self || bot) return stats;
  return [...stats, 'report', 'block'];
}
