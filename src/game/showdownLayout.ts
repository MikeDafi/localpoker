import type { Card } from '../engine/cards';

/**
 * Where the winning hands sit once a showdown is over.
 *
 * The community row used to grow from five cards to seven so the winner's hole
 * cards had somewhere to land. Seven across a phone shrinks every card past
 * the point its pips can be counted, and it charged the board's own cards for
 * the privilege of showing two more. So the board stays five, and the winning
 * hand sits in a row of its own underneath, centred under the board.
 *
 * That row holds every winning hand side by side rather than stacked. Stacking
 * was the obvious reading of "below the board" and it is the wrong one: the
 * band of felt between the seats and the hero pod is about one card tall, so a
 * second hand did not halve the cards, it shrank them to the legibility floor
 * and then ran the lower hand onto the hero anyway. Across, a split pot is
 * four cards under a five card board, which is narrower than the board itself,
 * so both hands keep the size a single winner gets.
 *
 * Returning a list per hand rather than one winner matters for its own reason:
 * taking the first winner, as the screen used to, tells the player the pot
 * went to somebody it did not.
 *
 * It is all arithmetic rather than layout, because these positions are the
 * flight targets of an absolutely positioned animation; keeping it pure is
 * also the only way to check it without a device.
 */

/** Cards are 1.42 times as tall as they are wide. */
export const CARD_ASPECT = 1.42;
/** Below this a card face is no longer readable, so the row is capped instead. */
export const MIN_REVEAL_CARD = 22;
/** Gap between the two cards of a single hand, tight so the pair reads as one. */
export const CARD_GAP = 6;
/** Gap between two hands, wide enough that four cards do not read as one hand. */
export const HAND_GAP = 18;
/** The gap never closes below this, or the hands merge into one long row. */
export const MIN_HAND_GAP = 8;
/**
 * Every winner gets a hand on the felt, up to a full table.
 *
 * This used to stop at three on the grounds that more would be unreadable.
 * That was the wrong trade: a four-way split is rare, but when it happens the
 * player is looking at a table where the pot went four ways and the felt shows
 * three hands, which does not say "too many to draw", it says the fourth
 * player did not win. Six is the table maximum, which a board that plays can
 * reach, and it still fits because the gaps give way before the cards do.
 */
export const MAX_REVEAL_HANDS = 6;

/**
 * How far apart two hands sit, given how many are sharing the row.
 *
 * The gap is the first thing asked to give. Space between hands only has to
 * separate them, so losing half of it costs nothing a player would notice;
 * taking the same points out of the cards costs the pips. At six hands the
 * gap is still wider than the gap inside a hand, which is the only thing it
 * has to be.
 */
export function handGapFor(hands: number): number {
  return Math.max(MIN_HAND_GAP, HAND_GAP - Math.max(0, hands - 2) * 4);
}

export interface ShowdownWinnerHand {
  playerId: string;
  name: string;
  hole: Card[];
  label: string;
}

export interface RevealHand {
  playerId: string;
  /** Centre of each of the two cards, in table-area coordinates. */
  targets: { x: number; y: number }[];
  /** Size the cards rest at. Shared by every hand so none looks favoured. */
  size: number;
}

/**
 * Pick the hands worth laying out.
 *
 * Returns every winner holding cards, not just the first, so a split pot shows
 * both. A winner who won uncontested is skipped by the caller supplying no
 * hand for them, and the local player's own cards are withheld until they
 * choose to table them, which is the one case where showing is a decision
 * rather than a consequence.
 */
export function selectShowdownHands<T extends { playerId: string; hand?: { cards?: unknown[] } | null }>(
  winners: readonly T[],
  players: readonly { id: string; name: string; holeCards: Card[] }[],
  options: { localPlayerId: string; localCardsShown: boolean; label: (winner: T) => string },
): ShowdownWinnerHand[] {
  const rows: ShowdownWinnerHand[] = [];
  for (const w of winners) {
    if (!w.hand?.cards?.length) continue;
    const p = players.find((pp) => pp.id === w.playerId);
    if (!p || p.holeCards.length < 2) continue;
    if (p.id === options.localPlayerId && !options.localCardsShown) continue;
    rows.push({
      playerId: p.id,
      name: p.name,
      hole: p.holeCards.slice(0, 2),
      label: options.label(w),
    });
    if (rows.length >= MAX_REVEAL_HANDS) break;
  }
  return rows;
}

/**
 * Place every winning hand in one row beneath the board.
 *
 * The row runs downward from `top`, which sits just under the board, rather
 * than being centred on it: the board keeps its own line and the winning hands
 * get the space beneath. Hands sit side by side about `centreX`, each a tight
 * pair with a wider gap to its neighbour, so four cards still read as two
 * hands rather than one.
 *
 * Width is what decides the size, because the lane below the board is only
 * about one card tall on a phone while the board itself is five cards wide.
 * Two hands is four cards, which is narrower than the board, so a split pot
 * costs the cards nothing. Past that the row is allowed to run wider than the
 * board and out to the edge of the felt, which is why `availableW` is the
 * felt's width rather than the board's: a three-way split that had to fit
 * under five cards would shrink for no reason, when there is empty cloth
 * either side of it.
 */
export function layoutRevealHands(input: {
  count: number;
  /** Horizontal centre of the board, which the hands line up under. */
  centreX: number;
  /** Top of the row, just below the board. */
  top: number;
  /** Size a hand rests at when there is room for it, normally the board's. */
  preferredSize: number;
  /** Width the row may use: the felt, which past two hands is wider than the board. */
  availableW: number;
  /** Vertical room below the board. */
  availableH: number;
  playerIds: string[];
}): RevealHand[] {
  const hands = Math.min(input.count, MAX_REVEAL_HANDS);
  if (hands <= 0) return [];

  /*
   * Solve for the card size that makes the row fit exactly:
   *   hands * (2 * size + CARD_GAP) + (hands - 1) * handGap <= availableW
   * One or two hands keep their preferred size in any realistic lane, which is
   * the ordinary case; a three or more way split has to buy its space, and
   * buys it out of the gaps first (see `handGapFor`) and then out of the
   * cards.
   */
  const handGap = handGapFor(hands);
  const spacing = hands * CARD_GAP + (hands - 1) * handGap;
  const byWidth = Math.max(1, Math.floor((input.availableW - spacing) / (2 * hands)));
  const byHeight = Math.floor(input.availableH / CARD_ASPECT);
  const fits = Math.min(input.preferredSize, byWidth, byHeight);
  /*
   * The legibility floor is a preference, not a promise.
   *
   * Holding every card at `MIN_REVEAL_CARD` regardless is how a six-way split
   * ran a row 340pt wide across 320pt of felt, putting cards off the table
   * entirely. A card too small to read is a poor outcome; a card drawn over
   * the rail is a broken one, so width wins when the two disagree.
   */
  const size = Math.max(fits, Math.min(MIN_REVEAL_CARD, byWidth));

  const handW = 2 * size + CARD_GAP;
  const totalW = hands * handW + (hands - 1) * handGap;
  const rowLeft = input.centreX - totalW / 2;
  const y = input.top + (size * CARD_ASPECT) / 2;

  return Array.from({ length: hands }, (_, i) => {
    const handLeft = rowLeft + i * (handW + handGap);
    return {
      playerId: input.playerIds[i] ?? `hand-${i}`,
      size,
      targets: [
        { x: handLeft + size / 2, y },
        { x: handLeft + size + CARD_GAP + size / 2, y },
      ],
    };
  });
}

/**
 * What to write on the pill above the board.
 *
 * Two players can split with the same hand ("Flush") or with different ones,
 * which only happens across side pots, so both readings have to work.
 */
export function showdownLabel(hands: readonly ShowdownWinnerHand[]): string {
  if (hands.length === 0) return '';
  if (hands.length === 1) return hands[0]!.label;
  const unique = Array.from(new Set(hands.map((h) => h.label)));
  return unique.length === 1 ? `Split pot \u00b7 ${unique[0]}` : `Split pot \u00b7 ${unique.join(' / ')}`;
}

/**
 * Who was beaten, as opposed to who merely was not paid.
 *
 * Gold on the winner left everyone else looking exactly as they had all hand,
 * so the result had to be read off the panel rather than the table. Red says
 * it on the seat. The distinction that matters is *contested*: somebody who
 * folded did not lose a showdown, they declined one, and colouring them red
 * would claim their cards were beaten when nobody ever saw them. A player who
 * won part of a split pot has not lost either, however small their share.
 */
export function lostAtShowdown(
  player: { id: string; folded?: boolean; sittingOut?: boolean; holeCards: unknown[] },
  winners: readonly { playerId: string; amount: number }[],
  options: { contested: boolean },
): boolean {
  if (!options.contested) return false;
  if (player.folded || player.sittingOut) return false;
  if (player.holeCards.length < 2) return false;
  return !winners.some((w) => w.playerId === player.id && w.amount > 0);
}
