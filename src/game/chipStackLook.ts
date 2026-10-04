/**
 * How tall a chip stack looks for a given amount.
 *
 * The compact stack, which is what a pod and a bet pill draw, was a single
 * chip whatever the number next to it said. A pile of 20 and a pile of 20,000
 * were the same picture, so the only thing carrying the size was the text,
 * and the chips were decoration.
 *
 * A stack is read as a quantity before the number next to it is, so it has to
 * grow. It grows by magnitude rather than by count: nobody can tally eleven
 * chips at this size, but everybody can see that one pile is twice the height
 * of another.
 */

/** Past this it stops reading as a stack and starts overlapping the pod. */
export const MAX_COMPACT_CHIPS = 6;

/**
 * One chip, and one more every time the amount quadruples.
 *
 * Quadrupling rather than doubling because a poker stack covers a very wide
 * range: at a 50/100 table a blind and a deep stack are three orders of
 * magnitude apart, and doubling would hit the ceiling almost immediately and
 * make every meaningful bet look identical again.
 */
export function compactChipCount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const steps = 1 + Math.floor(Math.log(amount) / Math.log(4));
  return Math.max(1, Math.min(MAX_COMPACT_CHIPS, steps));
}
