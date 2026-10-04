/**
 * Where the opponent pods sit around the felt.
 *
 * This was a fixed 120 degree arc across the top of the table with every seat
 * evenly spaced in *angle*. That is the bug: even angular spacing is not even
 * horizontal spacing, because x moves as the cosine of the angle, so the seats
 * at the two ends of the arc bunch up. At a full ring the end pods ended up
 * about 32pt apart while being 76pt wide, so they overlapped by more than
 * half, which is exactly what a player photographed.
 *
 * The fix is to stop placing seats on a curve and start *packing* them:
 *
 * 1. Work out how many pods fit across the stage in one row.
 * 2. Use as many rows as that requires, and no more.
 * 3. Spread each row evenly across its own width, so the gap inside a row is
 *    uniform by construction rather than by luck.
 * 4. Offset alternate rows by half a slot so the ring interleaves, which is
 *    both what a real table looks like from above and what stops a pod from
 *    sitting directly under its neighbour.
 *
 * Rows are a full pod height apart, so two pods in different rows can never
 * touch no matter where they sit horizontally. That is what makes the
 * guarantee in the tests hold rather than being approximately true.
 *
 * Kept here rather than in `TableScreen` because "no two pods overlap" is
 * arithmetic, and arithmetic can be tested. The table has been broken by
 * eyeballed layout four times now.
 */

export interface SeatRingInput {
  /** Seat index, 0 based, left to right. */
  index: number;
  /** How many opponents are seated. The game allows up to 8. */
  count: number;
  /** Width of the stage in points. */
  width: number;
  /** Height of the stage in points. */
  height: number;
  /** Width of one pod in points. The thing that must not overlap. */
  podWidth: number;
  /** Height of one pod in points. Also the spacing between rows. */
  podHeight: number;
}

export interface SeatRingSlot {
  left: number;
  top: number;
  /** Which row of the ring this seat is in, 0 being the back row. */
  row: number;
}

/** Clear space to leave between two pods in the same row, in points. */
export const SEAT_GAP = 6;

/** Points of stage edge a pod may not cross. */
export const EDGE_INSET = 2;

/**
 * How many pods fit across the stage in a single row.
 *
 * At least one, however narrow the screen, because returning zero here would
 * divide by zero downstream and a cramped seat beats no seat.
 */
export function seatsPerRow(width: number, podWidth: number): number {
  const usable = Math.max(0, width - EDGE_INSET * 2);
  return Math.max(1, Math.floor(usable / (podWidth + SEAT_GAP)));
}

/** How many rows the ring needs to hold `count` pods without overlapping. */
export function seatRowCount(count: number, width: number, podWidth: number): number {
  const safeCount = Math.max(1, Math.floor(count));
  return Math.ceil(safeCount / seatsPerRow(width, podWidth));
}

/**
 * Seats are dealt into rows round robin, so neighbouring seat numbers land in
 * different rows and the ring reads as a ring rather than as stacked lines.
 */
export function seatRow(index: number, count: number, width: number, podWidth: number): number {
  return Math.max(0, Math.floor(index)) % seatRowCount(count, width, podWidth);
}

/**
 * The slot for one seat.
 *
 * `left` is the pod's left edge and `top` its top edge, both ready to apply
 * directly. Both are clamped to the stage, so a pod may lean out over the
 * surround beyond the felt, which the design calls for, but never off screen.
 */
export function seatRingSlot(input: SeatRingInput): SeatRingSlot {
  const { count, width, height, podWidth, podHeight } = input;
  const safeCount = Math.max(1, Math.floor(count));
  const i = Math.max(0, Math.min(safeCount - 1, Math.floor(input.index)));

  const rows = seatRowCount(safeCount, width, podWidth);
  const row = i % rows;
  // How many seats share this row, and which of them this one is.
  const inRow = Math.ceil((safeCount - row) / rows);
  const place = Math.floor(i / rows);

  const usable = Math.max(0, width - EDGE_INSET * 2 - podWidth);
  /*
   * Each row spans the full width on its own terms. There is deliberately no
   * horizontal stagger: an offset row has to come out of the same width, and
   * the last seat in it then runs into the clamp at the right edge and lands
   * back on top of its neighbour, which is the overlap this module exists to
   * prevent. Rows hold different numbers of seats anyway, so their slots
   * differ and the ring still reads as a ring rather than as columns.
   */
  const slot = inRow > 1 ? usable / (inRow - 1) : 0;
  const left = EDGE_INSET + (inRow > 1 ? place * slot : usable / 2);

  /*
   * A single row keeps the old curved rail, because with a handful of players
   * the curve is what makes it look like a table rather than a toolbar. More
   * than one row drops the curve: rows are exactly a pod height apart, and a
   * curve would eat into that separation and put the overlap straight back.
   *
   * The crown of the arc used to be held down to clear the room code pill in
   * the header. The code has moved into the table's gear menu, so the arc can
   * now ride right to the top of the stage, which is where the extra room for
   * a busier ring comes from.
   */
  const baseTop = height * 0.012;
  const along = inRow > 1 ? place / (inRow - 1) : 0.5;
  const top = rows > 1
    ? baseTop + row * podHeight
    : baseTop + (1 - Math.sin(Math.PI * along)) * height * 0.14;

  return {
    left: Math.max(EDGE_INSET, Math.min(width - podWidth - EDGE_INSET, left)),
    top: Math.max(EDGE_INSET, top),
    row,
  };
}

/**
 * True when two slots cannot both be drawn without touching.
 *
 * Two pods clear each other if they are apart horizontally **or** vertically,
 * which is the whole point of the rows: neighbours are allowed to share
 * horizontal space precisely because they do not share vertical space.
 */
export function slotsOverlap(
  a: SeatRingSlot,
  b: SeatRingSlot,
  podWidth: number,
  podHeight: number,
): boolean {
  const apartX = Math.abs(a.left - b.left) >= podWidth + SEAT_GAP - 0.001;
  const apartY = Math.abs(a.top - b.top) >= podHeight - 0.001;
  return !apartX && !apartY;
}

/** The lowest pod bottom, which is where the community card lane may start. */
export function seatRingBottom(input: Omit<SeatRingInput, 'index'>): number {
  let lowest = 0;
  for (let i = 0; i < Math.max(1, input.count); i += 1) {
    const slot = seatRingSlot({ ...input, index: i });
    lowest = Math.max(lowest, slot.top + input.podHeight);
  }
  return lowest;
}
