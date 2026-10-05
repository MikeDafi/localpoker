/**
 * Where the opponent pods sit around the felt.
 *
 * Three wrong answers came before this one, and the fourth is a response to
 * all of them, so they are all worth recording.
 *
 * 1. A fixed arc with every seat evenly spaced in *angle*. Even angular
 *    spacing is not even horizontal spacing, because x moves as the cosine,
 *    so the pods at the ends bunched up and overlapped by half their width.
 * 2. Packing the pods into flat rows. That cannot overlap, which was the
 *    point, but it does not look like a table: a player photographed eight
 *    opponents in two straight lines with one pod stranded in the cloth.
 * 3. Putting the overflow down the left and right rails, beside the board.
 *    That is what a real table looks like and it is still the wrong answer
 *    HERE, because a phone is not a table: two rails cost about 170pt of a
 *    360pt felt, which is nearly half of it, and the five community cards
 *    were left so small they could not be read. The owner's words were "the
 *    middle cards are too small, have all the players above and ringed
 *    around the 5 potential cards so we can still have big 5 potential
 *    cards".
 *
 * So every seat is ABOVE the board, and the board keeps the full width of the
 * cloth. The ring is made out of nested arcs instead:
 *
 *   - Seats spread evenly across the top rail and follow the ellipse, so the
 *     middle sits high and the ends fall away. The drop is the ellipse itself
 *     rather than a sine, which matters: an ellipse is flat across the crown
 *     and turns down sharply at the ends, and that is what reads as the far
 *     rail of a table seen from above.
 *   - If they will not all fit across one arc, a second arc nests INSIDE the
 *     first: narrower, lower, and centred, so it reads as the near half of
 *     the same ring rather than as a second row.
 *
 * Up to five opponents, which is the default table and the common case, this
 * is a single arc and the board gets the whole felt at full height. Six and
 * above pay for the second arc in board height, and that is the right place
 * to pay: a crowded table is the one where a seat has to come from somewhere.
 *
 * Nothing can overlap, by construction rather than by arithmetic that has to
 * be rechecked. Two pods on the same arc are at least a pod and a gap apart
 * in x, because an arc never takes more seats than fit across its own span.
 * Two pods on different arcs are at least a pod apart in y, because the step
 * between arcs already includes the depth of the curve.
 *
 * Kept here rather than in `TableScreen` because "no two pods overlap" is
 * arithmetic, and arithmetic can be tested. The table has been broken by
 * eyeballed layout five times now.
 */

export interface SeatRingInput {
  /** Seat index, 0 based, running left to right along the outer arc first. */
  index: number;
  /** How many opponents are seated. The game allows up to 8. */
  count: number;
  /** Width of the stage in points. */
  width: number;
  /** Height of the stage in points. */
  height: number;
  /** Width of one pod in points. The thing that must not overlap. */
  podWidth: number;
  /** Height of one pod in points. Also the step between arcs. */
  podHeight: number;
}

export interface SeatRingSlot {
  left: number;
  top: number;
  /** Which arc this seat is on, 0 being the outer one along the top rail. */
  row: number;
}

/** Clear space to leave between two pods on the same arc, in points. */
export const SEAT_GAP = 6;

/** Points of stage edge a pod may not cross. */
export const EDGE_INSET = 2;

/**
 * How much narrower an inner arc is than the one outside it.
 *
 * This is the whole reason a crowded table still reads as a ring rather than
 * as two rows. It is a floor, not a fixed width: an inner arc holding enough
 * seats widens past it rather than letting its own pods touch, because not
 * overlapping outranks looking nested.
 */
const INNER_ARC_SPAN = 0.72;

/**
 * How many pods fit across one arc of a given span.
 *
 * `n` pods need `n` widths and `n - 1` gaps, which is why the gap is added
 * back before dividing. An earlier version divided by width plus gap and so
 * charged for a gap after the last pod, costing a whole seat on a narrow
 * screen and forcing a second arc that was not needed.
 *
 * At least one, however narrow the screen, because returning zero would
 * divide by zero downstream and a cramped seat beats no seat.
 */
function fitAcross(span: number, podWidth: number): number {
  return Math.max(1, Math.floor((Math.max(0, span) + SEAT_GAP) / (podWidth + SEAT_GAP)));
}

/** How many pods fit across the full width of the stage. */
export function seatsPerRow(width: number, podWidth: number): number {
  return fitAcross(width - EDGE_INSET * 2, podWidth);
}

/**
 * How the seats divide between the arcs, outer arc first.
 *
 * Everything that fits across the top goes across the top, because one arc is
 * both the best looking answer and the one that leaves the board the most
 * room. Beyond that the seats are split as evenly as the outer arc's capacity
 * allows, so a seven handed table is four and three rather than six and one,
 * which would read as a row with a straggler under it.
 */
export function seatArcCounts(count: number, width: number, podWidth: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];

  const capacity = seatsPerRow(width, podWidth);
  if (n <= capacity) return [n];

  const arcs = Math.max(2, Math.ceil(n / capacity));
  const counts: number[] = [];
  let left = n;
  for (let i = 0; i < arcs; i += 1) {
    // Share what is left evenly over the arcs still to come, so the outer arc
    // is never left holding a seat the inner one could have taken.
    const take = Math.min(capacity, Math.ceil(left / (arcs - i)));
    counts.push(take);
    left -= take;
  }
  if (left > 0) counts[0] += left;
  return counts;
}

/** Which arc a seat index lands on, and its place along that arc. */
function placeOnArc(index: number, counts: number[]): { row: number; place: number } {
  let seen = 0;
  for (let row = 0; row < counts.length; row += 1) {
    if (index < seen + counts[row]) return { row, place: index - seen };
    seen += counts[row];
  }
  const row = Math.max(0, counts.length - 1);
  return { row, place: Math.max(0, counts[row] - 1) };
}

/**
 * How much the rail falls away from the crown of an arc, in points.
 *
 * Capped against the pod as well as the stage, and flattened once there is
 * more than one arc. Every point of curve has to be paid for again in the
 * step between arcs, so a deep arc on a busy table would push the board down
 * the felt to buy a shape nobody asked for.
 */
function arcDepth(height: number, podHeight: number, arcs: number): number {
  const h = Math.max(0, height);
  return arcs > 1
    ? Math.min(h * 0.05, podHeight * 0.22)
    : Math.min(h * 0.1, podHeight * 0.45);
}

/**
 * The horizontal span an arc spreads its pods across.
 *
 * Inner arcs are pulled in so the ring nests, but never so far in that their
 * own pods would touch. The second term is the width that arc actually needs,
 * and it wins whenever the two disagree.
 */
function arcSpan(row: number, countOnArc: number, width: number, podWidth: number): number {
  const full = Math.max(0, width - EDGE_INSET * 2 - podWidth);
  if (row === 0) return full;
  const needed = Math.max(0, countOnArc - 1) * (podWidth + SEAT_GAP);
  return Math.min(full, Math.max(full * INNER_ARC_SPAN, needed));
}

function clampLeft(left: number, width: number, podWidth: number): number {
  const most = width - podWidth - EDGE_INSET;
  if (most < EDGE_INSET) return EDGE_INSET;
  return Math.max(EDGE_INSET, Math.min(most, left));
}

/**
 * The slot for one seat.
 *
 * `left` is the pod's left edge and `top` its top edge, both ready to apply
 * directly. `left` is clamped to the stage, so a pod may lean out over the
 * surround beyond the felt, which the design calls for, but never off screen.
 */
export function seatRingSlot(input: SeatRingInput): SeatRingSlot {
  const { count, width, height, podWidth, podHeight } = input;
  const safeCount = Math.max(1, Math.floor(count));
  const i = Math.max(0, Math.min(safeCount - 1, Math.floor(input.index)));

  const counts = seatArcCounts(safeCount, width, podWidth);
  const { row, place } = placeOnArc(i, counts);
  const onArc = counts[row] ?? 1;

  const span = arcSpan(row, onArc, width, podWidth);
  const start = EDGE_INSET + (Math.max(0, width - EDGE_INSET * 2 - podWidth) - span) / 2;
  const left = onArc > 1 ? start + (place * span) / (onArc - 1) : start + span / 2;

  const curve = arcDepth(height, podHeight, counts.length);
  const crown = Math.max(0, height) * 0.012;
  /*
   * Arcs are a pod height apart PLUS the depth of the curve.
   *
   * This is the part that is easy to get wrong, and I did once: curving the
   * arcs without widening the gap between them broke the one guarantee this
   * module exists to provide. Two pods on neighbouring arcs sit at different
   * points on their curves, so the lower one can be lifted by up to the full
   * depth while the upper one is not lifted at all, and the clearance between
   * them shrinks by exactly that much. Paying for the curve up front means
   * the worst case is still a clean pod height.
   */
  const rowStep = podHeight + curve;

  /*
   * The rail, not a sine wave.
   *
   * `t` is how far across the arc's own span the pod's middle sits, from -1
   * at one end to +1 at the other, and the drop is the ellipse through those
   * points. A sine looks similar at a glance and is wrong where it matters:
   * it falls away from the crown immediately, so three seats read as a
   * shallow V, where an ellipse holds the middle flat and only turns down
   * near the ends, which is what the far side of a table does.
   *
   * Measured against the arc's own span rather than the stage, so an inner
   * arc curves over its own width and the two read as nested rather than as
   * one arc with a flat line under it.
   */
  const half = span / 2;
  const centreX = left + podWidth / 2;
  const arcMiddle = start + podWidth / 2 + half;
  const t = half > 0 ? Math.max(-1, Math.min(1, (centreX - arcMiddle) / half)) : 0;
  const drop = curve * (1 - Math.sqrt(Math.max(0, 1 - t * t)));

  return {
    left: clampLeft(left, width, podWidth),
    top: Math.max(EDGE_INSET, crown + row * rowStep + drop),
    row,
  };
}

/**
 * True when two slots cannot both be drawn without touching.
 *
 * Two pods clear each other if they are apart horizontally **or** vertically,
 * which is what lets an inner arc sit under an outer one: they are allowed to
 * share horizontal space precisely because they do not share vertical space.
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

/**
 * The y the community cards may start at, clear of every pod.
 *
 * Every seat is above the board now, so this really is the lowest pod and
 * nothing else has to be taken into account. It was briefly more complicated
 * than that, when some seats sat beside the board instead, and simple is the
 * correct shape for it.
 */
export function seatRingBottom(input: Omit<SeatRingInput, 'index'>): number {
  let lowest = 0;
  for (let i = 0; i < Math.max(0, Math.floor(input.count)); i += 1) {
    const slot = seatRingSlot({ ...input, index: i });
    lowest = Math.max(lowest, slot.top + input.podHeight);
  }
  return lowest;
}
