import type { Card } from '../engine/cards';

/**
 * Where the winning hands sit once a showdown is over.
 *
 * A single winner's two cards slide into the two extra slots the community row
 * grows at showdown, which is the layout this screen has always used. A split
 * pot has no such place to put the second hand: the row cannot grow to nine
 * cards on a phone, and dropping one winner (which is what the screen used to
 * do, by taking the first winner it found) tells the player the pot went to
 * somebody it did not.
 *
 * So ties stack instead. Each winning hand keeps the same two columns, and the
 * hands sit one above another, centred on the lane. Cards shrink so the whole
 * stack fits the height the board row was already allowed, which is what keeps
 * it clear of the pot and off the hero pod.
 *
 * It is all arithmetic rather than layout, because these positions are the
 * flight targets of an absolutely positioned animation; keeping it pure is
 * also the only way to check it without a device.
 */

/** Cards are 1.42 times as tall as they are wide. */
export const CARD_ASPECT = 1.42;
/** Below this a card face is no longer readable, so the stack is capped instead. */
export const MIN_REVEAL_CARD = 24;
/** Gap between two stacked hands. */
export const ROW_GAP = 6;
/**
 * At most three hands are laid out.
 *
 * A four-way split is vanishingly rare and would shrink every card past
 * legibility; the result panel still names every winner.
 */
export const MAX_REVEAL_ROWS = 3;

export interface ShowdownWinnerHand {
  playerId: string;
  name: string;
  hole: Card[];
  label: string;
}

export interface RevealRow {
  playerId: string;
  /** Centre of each of the two cards, in table-area coordinates. */
  targets: { x: number; y: number }[];
  /** Size the cards rest at. Shared by every row so no hand looks favoured. */
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
    if (rows.length >= MAX_REVEAL_ROWS) break;
  }
  return rows;
}

/**
 * Place each hand's two cards.
 *
 * `boardCentreY` is where a single hand lands, which is the middle of the
 * community row. Extra hands are distributed around it so the stack as a whole
 * stays centred rather than growing downward into the pot.
 */
export function layoutRevealRows(input: {
  count: number;
  /** Centre x of the two landing columns, left then right. */
  columnX: [number, number];
  boardCentreY: number;
  /** Size a single hand would rest at. */
  preferredSize: number;
  /** Vertical room the stack may use, centred on `boardCentreY`. */
  availableH: number;
  playerIds: string[];
}): RevealRow[] {
  const rows = Math.min(input.count, MAX_REVEAL_ROWS);
  if (rows <= 0) return [];

  /*
   * Solve for the card size that makes the stack fit exactly.
   *
   * rows * (size * CARD_ASPECT) + (rows - 1) * ROW_GAP <= availableH
   *
   * A single row therefore keeps its preferred size whenever the board row
   * already fits, which it does by construction, so nothing about the
   * one-winner case moves.
   */
  const perRowH = (input.availableH - (rows - 1) * ROW_GAP) / rows;
  const size = Math.max(
    MIN_REVEAL_CARD,
    Math.min(input.preferredSize, Math.floor(perRowH / CARD_ASPECT)),
  );
  const rowH = size * CARD_ASPECT;
  const stackH = rows * rowH + (rows - 1) * ROW_GAP;
  const firstCentreY = input.boardCentreY - stackH / 2 + rowH / 2;

  return Array.from({ length: rows }, (_, i) => ({
    playerId: input.playerIds[i] ?? `row-${i}`,
    size,
    targets: [
      { x: input.columnX[0], y: firstCentreY + i * (rowH + ROW_GAP) },
      { x: input.columnX[1], y: firstCentreY + i * (rowH + ROW_GAP) },
    ],
  }));
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
