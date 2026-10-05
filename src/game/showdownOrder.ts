/**
 * Who shows first at a showdown, and who has no choice about it.
 *
 * Poker has a real rule for this and the table was not following it: every
 * hand was turned over at once. The order is the whole point. You show in
 * turn, and because you can see what is already on the table you can throw
 * your hand away rather than publish a losing bluff to everyone who will be
 * playing against you for the rest of the night.
 *
 * The rule, as a card room runs it:
 *
 * - If there was a bet on the final round, the **last aggressor** shows
 *   first. They made the claim, so they back it up.
 * - If the final round was checked through, nobody made a claim, so it starts
 *   with the first player left of the button and moves clockwise.
 * - Everyone else may muck, in turn, having seen what is already shown.
 * - A hand that **wins** has to be tabled. You cannot be paid for a hand
 *   nobody saw.
 */

export interface ShowdownSeat {
  id: string;
  folded?: boolean;
  sittingOut?: boolean;
  holeCards: readonly unknown[];
}

export interface ShowdownOrderInput {
  players: readonly ShowdownSeat[];
  dealerIndex: number;
  /**
   * The last player to bet or raise on the final round, or null when it was
   * checked through. The engine already clears this at the start of every
   * street and never clears it on the way into a showdown, so by the time it
   * is read here it means exactly what it needs to.
   */
  lastAggressorIndex: number | null;
  /** Who the engine awarded chips to, so their hands cannot be hidden. */
  winnerIds: readonly string[];
}

export interface ShowdownOrder {
  /** Player ids, in the order they are asked to show or muck. */
  order: string[];
  /** Those who are not allowed to muck: the first to act, and any winner. */
  mustShow: string[];
}

const contests = (seat: ShowdownSeat): boolean =>
  !seat.folded && !seat.sittingOut && seat.holeCards.length > 0;

/**
 * Clockwise from a starting seat, skipping anyone not in the hand.
 *
 * `from` is a seat index rather than a position in the order, because both
 * the aggressor and the button are seats and only one of them is in the hand.
 */
function clockwiseFrom(players: readonly ShowdownSeat[], from: number, inclusive: boolean): string[] {
  const out: string[] = [];
  const n = players.length;
  if (n === 0) return out;
  for (let step = inclusive ? 0 : 1; step < n + (inclusive ? 0 : 1); step += 1) {
    const seat = players[(((from + step) % n) + n) % n];
    if (seat && contests(seat)) out.push(seat.id);
    if (out.length === players.filter(contests).length) break;
  }
  return out;
}

export function showdownOrder(input: ShowdownOrderInput): ShowdownOrder {
  const { players, dealerIndex, lastAggressorIndex, winnerIds } = input;
  const live = players.filter(contests);
  if (live.length === 0) return { order: [], mustShow: [] };

  const aggressor =
    lastAggressorIndex !== null && players[lastAggressorIndex] && contests(players[lastAggressorIndex])
      ? players[lastAggressorIndex]
      : null;

  /*
   * An aggressor who folded cannot show, which sounds impossible but is not:
   * they can bet the river, be raised, and fold. The claim dies with the
   * fold, so the hand reverts to the checked-through order.
   */
  const order = aggressor
    ? clockwiseFrom(players, players.indexOf(aggressor), true)
    : clockwiseFrom(players, dealerIndex, false);

  const winners = new Set(winnerIds);
  /*
   * Only a claim forces a hand face up.
   *
   * The first player in the order used to be forced to show whatever the
   * order was built from, which meant that on a river everybody checked, the
   * first player left of the button had their losing hand published for
   * nothing. Nobody made a claim on a checked round, so there is nothing to
   * back up, and a beaten hand is exactly the thing a player is entitled to
   * throw away unseen.
   *
   * A winner is still forced, because you cannot be paid for a hand nobody
   * saw, and the aggressor is still forced, because they bet and have to
   * show for it. Everyone else may muck.
   */
  const mustShow = order.filter((id, i) => (aggressor !== null && i === 0) || winners.has(id));
  return { order, mustShow };
}

/**
 * Whether a seat may throw its hand away rather than show.
 *
 * Everything that is not forced is a choice, including a losing hand the
 * player would rather keep to themselves.
 */
export function canMuck(order: ShowdownOrder, playerId: string): boolean {
  return order.order.includes(playerId) && !order.mustShow.includes(playerId);
}

/**
 * What a bot does when its turn to show comes round.
 *
 * A bot that has to show, shows. Otherwise it behaves like a player who does
 * not enjoy being laughed at: it tables a hand that is still winning and
 * throws away one that is beaten by something already face up.
 */
export function botShowsHand(input: {
  order: ShowdownOrder;
  playerId: string;
  /** True when nothing already shown beats this hand. */
  stillBest: boolean;
}): boolean {
  if (!canMuck(input.order, input.playerId)) return true;
  return input.stillBest;
}
