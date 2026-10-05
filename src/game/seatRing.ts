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
   * Every row is curved, not just a single one.
   *
   * Dropping the curve the moment a second row was needed is what turned a
   * busy table into a grid of flat lines with the end pods sitting out on the
   * surround, well off the felt. The crescent is the thing that makes it read
   * as a table seen from above, and it is wanted at eight seats more than at
   * three.
   *
   * The drop is a function of the pod's absolute horizontal position rather
   * than of its place within its row. That is what keeps the rows exactly a
   * pod height apart: two pods at the same x get the identical drop, so the
   * curve cancels between rows instead of eating the clearance that stops
   * them touching. Deriving it from place-in-row would not, because rows hold
   * different numbers of seats and the same place means a different x.
   *
   * The depth is capped against the pod height for the same reason: the
   * guarantee this module exists to provide is that no two pods overlap, and
   * a curve deep enough to swallow a row would quietly take it away.
   */
  const baseTop = height * 0.012;
  const centreX = left + podWidth / 2;
  const alongX = width > 0 ? Math.max(0, Math.min(1, centreX / width)) : 0.5;
  /*
   * A shallower curve once there is more than one row, because every point of
   * curve has to be paid for in row spacing below, and a deep arc on a busy
   * table would push the back row into the header.
   */
  const curveDepth = rows > 1
    ? Math.min(height * 0.05, podHeight * 0.22)
    : Math.min(height * 0.14, podHeight * 0.55);
  /*
   * Rows are a pod height apart PLUS the depth of the curve.
   *
   * This is the part that is easy to get wrong, and I did: curving the rows
   * without widening the gap between them broke the one guarantee this module
   * exists to provide. Two pods in neighbouring rows sit at different points
   * on the arc, so the lower one can be lifted by up to the full curve depth
   * while the upper one is not lifted at all, and the clearance between them
   * shrinks by exactly that much. Paying for the curve up front means the
   * worst case is still a clean pod height, whatever the arc does.
   */
  const rowStep = podHeight + curveDepth;
  const top = baseTop + row * rowStep + (1 - Math.sin(Math.PI * alongX)) * curveDepth;

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
