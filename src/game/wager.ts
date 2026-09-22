/**
 * Wager rounding.
 *
 * Every voluntary bet, raise and all-in is snapped to a round number so the
 * table never shows amounts like 368 or 1,237. Two cases make this less trivial
 * than `Math.round(v / 10) * 10`:
 *
 *  - **All-in must stay exact.** Rounding a shove down to the nearest ten would
 *    quietly leave chips behind; rounding up would be an illegal bet.
 *  - **Some legal ranges contain no multiple of ten at all** — a min-raise of
 *    15 against a 18-chip stack, say. Rounding there has to fall back to a legal
 *    amount rather than produce one the engine will reject.
 */

/** Chip granularity: every wager ends in a zero. */
export const WAGER_STEP = 10;

/**
 * Snap `value` to the nearest `step`, guaranteeing the result stays within the
 * legal `[min, max]` range.
 */
export function roundWager(value: number, min: number, max: number, step: number = WAGER_STEP): number {
  if (!Number.isFinite(value)) return min;
  if (max <= min) return max;
  // Going all-in is an exact amount, not a rounded one.
  if (value >= max) return max;

  let rounded = Math.round(value / step) * step;
  if (rounded < min) rounded = Math.ceil(min / step) * step;
  if (rounded > max) rounded = Math.floor(max / step) * step;

  // No multiple of `step` fits between min and max: keep it legal instead.
  if (rounded < min || rounded > max) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
  return rounded;
}

/** Whether an amount is a round number of chips. */
export function isRoundWager(value: number, step: number = WAGER_STEP): boolean {
  return value % step === 0;
}
