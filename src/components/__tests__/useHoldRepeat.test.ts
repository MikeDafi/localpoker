import { describe, it, expect } from 'vitest';

import {
  holdInterval,
  holdMultiplier,
  HOLD_DELAY_MS,
  HOLD_MIN_INTERVAL_MS,
} from '../useHoldRepeat';

/**
 * The ramp behind press-and-hold on a stepper. Pure, so the feel can be
 * reasoned about without a device: tapping once per big blind is fine for a
 * raise to 80 and absurd for a stack of 50,000.
 */
describe('holdMultiplier', () => {
  it('does not multiply a deliberate single tap', () => {
    expect(holdMultiplier(0)).toBe(1);
    expect(holdMultiplier(HOLD_DELAY_MS - 1)).toBe(1);
  });

  it('starts at one when the repeat begins', () => {
    expect(holdMultiplier(HOLD_DELAY_MS)).toBe(1);
  });

  it('doubles as the hold continues', () => {
    expect(holdMultiplier(HOLD_DELAY_MS + 700)).toBe(2);
    expect(holdMultiplier(HOLD_DELAY_MS + 1400)).toBe(4);
    expect(holdMultiplier(HOLD_DELAY_MS + 2100)).toBe(8);
  });

  it('caps, so a long hold cannot run away to an unusable jump', () => {
    expect(holdMultiplier(HOLD_DELAY_MS + 60_000)).toBe(64);
  });

  it('crosses a deep stack in a few seconds at a 20 chip step', () => {
    const step = 20;
    let total = 0;
    for (let held = HOLD_DELAY_MS; held < HOLD_DELAY_MS + 3000; held += holdInterval(held)) {
      total += step * holdMultiplier(held);
    }
    expect(total).toBeGreaterThan(2000);
  });
});

describe('holdInterval', () => {
  it('starts gently so a short hold is still controllable', () => {
    expect(holdInterval(0)).toBeGreaterThan(150);
  });

  it('speeds up as the hold continues', () => {
    expect(holdInterval(500)).toBeLessThan(holdInterval(0));
  });

  it('never goes below the floor, which would read as a blur', () => {
    expect(holdInterval(10_000)).toBe(HOLD_MIN_INTERVAL_MS);
    expect(holdInterval(1_000_000)).toBeGreaterThanOrEqual(HOLD_MIN_INTERVAL_MS);
  });
});
