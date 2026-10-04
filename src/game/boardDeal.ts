/**
 * Timing for dealing the community cards.
 *
 * The delay for a board card must depend **only on that card's own index**, never
 * on how much of the board is currently showing. An earlier version derived it
 * from `board.length`, which meant that when the turn landed, the second and
 * third flop cards had their delay change (140ms and 280ms both became 0). The
 * card component re-runs its throw animation when its delay changes, and the
 * throw starts from fully transparent, so two already-placed cards blinked out
 * of existence and flew back in every time a new street was dealt.
 */

/** Cards in the flop are staggered by this much, in ms. */
export const BOARD_DEAL_STEP = 140;

/**
 * How long a community card takes to fly in.
 *
 * Slower than a hole card on purpose. A hole card is dealt two at a time to
 * somebody who already knows what is coming, so it can be brisk. The flop,
 * the turn and the river are the moments the whole table is watching, and at
 * the speed a hole card travels they arrived before anyone had finished
 * looking up. Hole cards keep `motion.dealCard` and are unaffected.
 */
export const BOARD_THROW_MS = 520;

/**
 * Stagger for the board card at `index`.
 *
 * The flop arrives as three cards at once and is staggered so they land one
 * after another; the turn and river are single cards, so they land immediately.
 */
export function boardDealDelay(index: number, stepMs: number = BOARD_DEAL_STEP): number {
  if (index < 0) return 0;
  return index < 3 ? index * stepMs : 0;
}
