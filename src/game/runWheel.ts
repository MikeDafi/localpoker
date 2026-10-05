/**
 * Turning a scroll position into a number of boards, and back.
 *
 * The run-out vote used to be one button per count, which does not survive
 * going to four: four buttons in the result card's width leaves each one too
 * narrow to read, and the row reads as four options rather than as one dial
 * with a value on it. A wheel says "pick a number" in a way a row of buttons
 * does not.
 *
 * The arithmetic lives here rather than in the component because it is the
 * part that can be wrong in a way nobody sees: an off-by-one lands the wheel
 * on 2 when it says 3, and a vote for the wrong number of boards is a real
 * change to how a pot is split.
 */

import { MAX_RUNS, type RunCount } from './runItTwice';

/** Height of one row on the wheel, in points. */
export const RUN_WHEEL_ITEM_H = 46;

/** Every count the wheel offers, lowest first. */
export function runWheelOptions(max: number = MAX_RUNS): RunCount[] {
  const top = Math.max(1, Math.min(MAX_RUNS, Math.floor(max)));
  return Array.from({ length: top }, (_, i) => (i + 1) as RunCount);
}

/**
 * Where the wheel has to sit for a given count to be the one in the window.
 *
 * The list is padded by one row top and bottom so the first and last values
 * can reach the middle, which is why this is a plain multiple of the row
 * height rather than that offset by the padding.
 */
export function offsetForRun(run: number): number {
  const index = Math.max(0, Math.min(MAX_RUNS - 1, Math.floor(run) - 1));
  return index * RUN_WHEEL_ITEM_H;
}

/**
 * Which count the wheel is showing, given where it came to rest.
 *
 * Rounded rather than truncated: a wheel left a pixel short of a row is
 * pointing at that row, and flooring would read it as the one below.
 * Clamped because iOS allows a scroll view to be dragged past its own end.
 */
export function runAtOffset(offsetY: number, max: number = MAX_RUNS): RunCount {
  const top = Math.max(1, Math.min(MAX_RUNS, Math.floor(max)));
  const safe = Number.isFinite(offsetY) ? offsetY : 0;
  const index = Math.round(safe / RUN_WHEEL_ITEM_H);
  return (Math.max(0, Math.min(top - 1, index)) + 1) as RunCount;
}
