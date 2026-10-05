/**
 * Where the opponent pods sit around the felt.
 *
 * Two wrong answers came before this one, and both are worth recording
 * because the third is a response to them.
 *
 * The first was a fixed arc with every seat evenly spaced in *angle*. Even
 * angular spacing is not even horizontal spacing, because x moves as the
 * cosine, so the pods at the two ends of the arc bunched together and
 * overlapped by more than half their width.
 *
 * The second was to abandon the arc and *pack* the pods into rows: fit as
 * many across as the screen allows, then start another row. That cannot
 * overlap, which was the point, but it does not look like a table. A player
 * photographed eight opponents sitting in two flat lines with one pod
 * stranded in the middle of the cloth, and said, correctly, that they should
 * be "around the circle side by side with each other".
 *
 * So: the ring is a ring again, but it is built out of positions that cannot
 * collide rather than out of an angle that might.
 *
 * A seat is either on the TOP ARC or in a SIDE COLUMN.
 *
 *   - The top arc spreads evenly across the full stage width and follows the
 *     rail, so the middle pods sit high and the end pods sit low. The drop is
 *     the ellipse itself rather than a sine, which matters: an ellipse is
 *     flat across the crown and falls away sharply at the ends, and that is
 *     what reads as the far rail of a table seen from above.
 *   - Anything that will not fit across the top goes *down the sides*, pinned
 *     to the left and right rails, exactly as the ninth and tenth players at
 *     a real table sit beside the board rather than behind it.
 *
 * Nothing can overlap, by construction rather than by arithmetic that has to
 * be checked. Two pods on the arc are at least a pod and a gap apart in x.
 * Two pods in the same column are at least a pod apart in y. A column pod and
 * an arc pod either share the rail, and are then a column step apart in y, or
 * are a whole slot apart in x. The left and right columns are the width of
 * the stage apart.
 *
 * Seats are numbered the way the eye travels: up the left column, across the
 * top from left to right, then down the right column. The hero sits at the
 * bottom centre, so seat 0 and the last seat are the two players either side
 * of them, which is what a seating order means.
 *
 * Kept here rather than in `TableScreen` because "no two pods overlap" is
 * arithmetic, and arithmetic can be tested. The table has been broken by
 * eyeballed layout five times now.
 */

export interface SeatRingInput {
  /** Seat index, 0 based, running around the ring from the hero's left. */
  index: number;
  /** How many opponents are seated. The game allows up to 8. */
  count: number;
  /** Width of the stage in points. */
  width: number;
  /** Height of the stage in points. */
  height: number;
  /** Width of one pod in points. The thing that must not overlap. */
  podWidth: number;
  /** Height of one pod in points. Also the step down a side column. */
  podHeight: number;
  /**
   * Points at the bottom of the stage the ring may not use, for the hero's
   * own pod.
   *
   * Without it a side column counts all the way to the bottom of the stage
   * and the deepest seat lands on top of your own cards, which is the one
   * collision the overlap test cannot catch because the hero is not on the
   * ring.
   */
  bottomReserve?: number;
}

/** Which part of the ring a seat sits on. */
export type SeatSide = 'left' | 'top' | 'right';

export interface SeatRingSlot {
  left: number;
  top: number;
  /** 0 on the top arc, then 1 for each step down a side column. */
  row: number;
  side: SeatSide;
}

/** Clear space to leave between two pods, in points. */
export const SEAT_GAP = 6;

/** Points of stage edge a pod may not cross. */
export const EDGE_INSET = 2;

/**
 * How many pods fit across the top of the stage.
 *
 * `n` pods need `n` widths and `n - 1` gaps, which is why the gap is added
 * back before dividing. The older version divided by width plus gap and so
 * charged for a gap after the last pod, costing a whole seat on a narrow
 * screen and sending it down a side column that did not need to exist.
 *
 * At least one, however narrow the screen, because returning zero would
 * divide by zero downstream and a cramped seat beats no seat.
 */
export function seatsPerRow(width: number, podWidth: number): number {
  const usable = Math.max(0, width - EDGE_INSET * 2);
  return Math.max(1, Math.floor((usable + SEAT_GAP) / (podWidth + SEAT_GAP)));
}

export interface SeatRingShape {
  /** Seats across the top arc. */
  top: number;
  /** Seats down the left rail. */
  left: number;
  /** Seats down the right rail. */
  right: number;
}

/**
 * How the seats divide between the arc and the two columns.
 *
 * Two rules, in order. Everything that fits across the top goes across the
 * top, because the arc is the part that reads as a table. Then, if anything
 * is left over, the columns are made SYMMETRIC even when that means moving a
 * seat off the arc that would have fitted on it.
 *
 * The symmetry is deliberate and costs a seat's worth of arc at odd counts.
 * One pod hanging off the left rail with nothing opposite it does not read as
 * a ring, it reads as a mistake, which is the whole complaint this module is
 * answering.
 */
export function seatRingShape(count: number, width: number, podWidth: number): SeatRingShape {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return { top: 0, left: 0, right: 0 };

  const capacity = seatsPerRow(width, podWidth);
  if (n <= capacity) return { top: n, left: 0, right: 0 };

  /*
   * A stage too narrow for two pods side by side has no right column to
   * speak of: both rails are the same strip of screen. Everything overflows
   * into one column so the depths stay distinct and nothing collides.
   */
  if (capacity < 2) return { top: 1, left: n - 1, right: 0 };

  let sides = n - capacity;
  // Round up to even so the two columns match, but never empty the arc.
  if (sides % 2 === 1 && n - (sides + 1) >= 1) sides += 1;

  const perSide = Math.ceil(sides / 2);
  return { top: n - sides, left: perSide, right: sides - perSide };
}

/** Which part of the ring a seat index lands on, and how deep. */
function placeOnRing(
  index: number,
  shape: SeatRingShape,
): { side: SeatSide; depth: number; place: number } {
  /*
   * Up the left column first, deepest seat first, so seat 0 is the player
   * immediately to the hero's left rather than the one furthest from them.
   */
  if (index < shape.left) return { side: 'left', depth: shape.left - index, place: 0 };
  const onTop = index - shape.left;
  if (onTop < shape.top) return { side: 'top', depth: 0, place: onTop };
  return { side: 'right', depth: onTop - shape.top + 1, place: 0 };
}

/** How much the rail falls away from the crown of the arc, in points. */
function arcDepth(height: number, podHeight: number): number {
  /*
   * Capped against the pod as well as the stage. The guarantee this module
   * provides is that no two pods overlap, and an arc deep enough to swallow
   * a pod would quietly take that away by dropping an end seat into the
   * column beneath it.
   */
  return Math.min(Math.max(0, height) * 0.1, podHeight * 0.45);
}

/** The x a pod on the top arc sits at, for `place` of `across` seats. */
function arcLeft(place: number, across: number, width: number, podWidth: number): number {
  const span = width - EDGE_INSET * 2 - podWidth;
  if (across <= 1) return EDGE_INSET + span / 2;
  return EDGE_INSET + (place * span) / (across - 1);
}

/** The y of the crown of the arc. */
function arcTop(height: number): number {
  return Math.max(0, height) * 0.012;
}

/**
 * How far a side column steps between pods.
 *
 * Never less than a pod, which is what stops two seats in the same column
 * touching. On a stage with no room for the column it spills past the bottom
 * instead of compressing, because a pod drawn half over its neighbour is a
 * worse answer than a pod drawn low.
 */
function columnStep(input: {
  height: number;
  podHeight: number;
  depth: number;
  crownBottom: number;
  bottomReserve: number;
}): number {
  const room = Math.max(
    0,
    input.height - EDGE_INSET - input.podHeight - input.crownBottom - Math.max(0, input.bottomReserve),
  );
  const wanted = input.podHeight + SEAT_GAP;
  if (input.depth <= 0) return wanted;
  return Math.max(input.podHeight, Math.min(wanted, room / input.depth));
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

  const shape = seatRingShape(safeCount, width, podWidth);
  const { side, depth, place } = placeOnRing(i, shape);

  const depthCap = Math.max(shape.left, shape.right, 1);
  const curve = arcDepth(height, podHeight);
  const crown = arcTop(height);
  // The arc's lowest point, which is where a column starts counting from.
  const crownBottom = crown + curve;

  if (side === 'top') {
    const left = arcLeft(place, shape.top, width, podWidth);
    /*
     * The rail, not a sine wave.
     *
     * `t` is how far across the stage the pod's middle is, from -1 at the
     * left rail to +1 at the right, and the drop is the ellipse through those
     * points. A sine looks similar at a glance and is wrong in the place it
     * matters: it falls away from the crown immediately, so three seats read
     * as a shallow V, where an ellipse holds the middle flat and only turns
     * down near the ends, which is what the far side of a table does.
     */
    const centreX = left + podWidth / 2;
    const half = width / 2;
    const t = half > 0 ? Math.max(-1, Math.min(1, (centreX - half) / half)) : 0;
    const drop = curve * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
    return {
      left: clampLeft(left, width, podWidth),
      top: Math.max(EDGE_INSET, crown + drop),
      row: 0,
      side,
    };
  }

  const step = columnStep({
    height,
    podHeight,
    depth: depthCap,
    crownBottom,
    bottomReserve: input.bottomReserve ?? 0,
  });
  const left = side === 'left' ? EDGE_INSET : width - podWidth - EDGE_INSET;
  return {
    left: clampLeft(left, width, podWidth),
    top: Math.max(EDGE_INSET, crownBottom + depth * step),
    row: depth,
    side,
  };
}

export interface SeatRingLane {
  /** The y the community cards may start at, clear of the top arc. */
  top: number;
  /** Width taken out of the left of the felt by a side column, in points. */
  leftInset: number;
  /** Width taken out of the right of the felt by a side column. */
  rightInset: number;
}

/**
 * The band of felt the board gets, once the seats have taken theirs.
 *
 * The important part is what this does NOT measure. The lane used to start
 * below the lowest pod of all, which was right when every pod was above the
 * board and is wrong now that some sit beside it. Counting the side columns
 * vertically would push the board off the bottom of the felt to clear seats
 * that are not in its way. They cost width instead, which is what they
 * actually cost.
 */
export function seatRingLane(input: Omit<SeatRingInput, 'index'>): SeatRingLane {
  const safeCount = Math.max(0, Math.floor(input.count));
  if (safeCount === 0) return { top: 0, leftInset: 0, rightInset: 0 };

  const shape = seatRingShape(safeCount, input.width, input.podWidth);
  let top = 0;
  for (let i = 0; i < safeCount; i += 1) {
    const slot = seatRingSlot({ ...input, index: i });
    if (slot.side !== 'top') continue;
    top = Math.max(top, slot.top + input.podHeight);
  }

  const column = EDGE_INSET + input.podWidth + SEAT_GAP;
  return {
    top,
    leftInset: shape.left > 0 ? column : 0,
    rightInset: shape.right > 0 ? column : 0,
  };
}

/**
 * True when two slots cannot both be drawn without touching.
 *
 * Two pods clear each other if they are apart horizontally **or** vertically,
 * which is the whole point of the ring: a seat down the left rail is allowed
 * to share horizontal space with the arc pod above it precisely because it
 * does not share vertical space.
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

/** The lowest pod bottom anywhere on the ring, side columns included. */
export function seatRingBottom(input: Omit<SeatRingInput, 'index'>): number {
  let lowest = 0;
  for (let i = 0; i < Math.max(1, input.count); i += 1) {
    const slot = seatRingSlot({ ...input, index: i });
    lowest = Math.max(lowest, slot.top + input.podHeight);
  }
  return lowest;
}
