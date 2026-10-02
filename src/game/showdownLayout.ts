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
export const MIN_REVEAL_CARD = 24;
/** Gap between the two cards of a single hand, tight so the pair reads as one. */
export const CARD_GAP = 6;
/** Gap between two hands, wide enough that four cards do not read as one hand. */
export const HAND_GAP = 18;
/**
 * At most three hands are laid out.
 *
 * A four-way split is vanishingly rare and would shrink every card past
 * legibility; the result panel still names every winner.
 */
export const MAX_REVEAL_HANDS = 3;

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
 * costs the cards nothing.
 */
export function layoutRevealHands(input: {
  count: number;
  /** Horizontal centre of the board, which the hands line up under. */
  centreX: number;
  /** Top of the row, just below the board. */
  top: number;
  /** Size a hand rests at when there is room for it, normally the board's. */
  preferredSize: number;
  /** Width the row may use, normally the board's own. */
  availableW: number;
  /** Vertical room below the board. */
  availableH: number;
  playerIds: string[];
}): RevealHand[] {
  const hands = Math.min(input.count, MAX_REVEAL_HANDS);
  if (hands <= 0) return [];

  /*
   * Solve for the card size that makes the row fit exactly:
   *   hands * (2 * size + CARD_GAP) + (hands - 1) * HAND_GAP <= availableW
   * A single hand keeps its preferred size in any realistic lane, which is the
   * ordinary case; only a three way split has to buy its space.
   */
  const spacing = hands * CARD_GAP + (hands - 1) * HAND_GAP;
  const byWidth = Math.floor((input.availableW - spacing) / (2 * hands));
  const byHeight = Math.floor(input.availableH / CARD_ASPECT);
  const size = Math.max(MIN_REVEAL_CARD, Math.min(input.preferredSize, byWidth, byHeight));

  const handW = 2 * size + CARD_GAP;
  const totalW = hands * handW + (hands - 1) * HAND_GAP;
  const rowLeft = input.centreX - totalW / 2;
  const y = input.top + (size * CARD_ASPECT) / 2;

  return Array.from({ length: hands }, (_, i) => {
    const handLeft = rowLeft + i * (handW + HAND_GAP);
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
