import { describe, expect, it } from 'vitest';
import { MAX_RUNS } from '../runItTwice';
import {
  RUN_WHEEL_ITEM_H,
  offsetForRun,
  runAtOffset,
  runWheelOptions,
} from '../runWheel';

/**
 * The wheel's whole job is to agree with itself: whatever `offsetForRun` puts
 * on screen, `runAtOffset` has to read back. An off-by-one here is invisible
 * and votes for the wrong number of boards.
 */
describe('the run-out wheel', () => {
  it('offers every count up to the ceiling', () => {
    expect(runWheelOptions()).toEqual([1, 2, 3, 4]);
    expect(runWheelOptions()).toHaveLength(MAX_RUNS);
  });

  it('reads back whatever it was told to show', () => {
    for (const run of runWheelOptions()) {
      expect(runAtOffset(offsetForRun(run))).toBe(run);
    }
  });

  it('rounds to the row it is nearest, not the one below', () => {
    // A wheel a hair short of row 3 is pointing at row 3.
    expect(runAtOffset(offsetForRun(3) - 1)).toBe(3);
    expect(runAtOffset(offsetForRun(3) + 1)).toBe(3);
    // Still inside the top half of the gap between 1 and 2.
    expect(runAtOffset(RUN_WHEEL_ITEM_H * 0.49)).toBe(1);
    expect(runAtOffset(RUN_WHEEL_ITEM_H * 0.51)).toBe(2);
  });

  it('survives being dragged past either end', () => {
    // iOS lets a scroll view bounce beyond its content.
    expect(runAtOffset(-500)).toBe(1);
    expect(runAtOffset(99999)).toBe(MAX_RUNS);
  });

  it('never points at a count the game would refuse', () => {
    for (const offset of [-1, 0, 7, 140, 1000]) {
      const run = runAtOffset(offset);
      expect(run).toBeGreaterThanOrEqual(1);
      expect(run).toBeLessThanOrEqual(MAX_RUNS);
    }
  });

  it('treats a nonsense offset as the first row rather than crashing', () => {
    expect(runAtOffset(Number.NaN)).toBe(1);
  });
});
