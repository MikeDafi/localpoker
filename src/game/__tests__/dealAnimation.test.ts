import { describe, expect, it } from 'vitest';
import { restoredDealHandNumber, shouldAnimateDeal } from '../dealAnimation';

describe('deal animation resume gating', () => {
  it('does not animate the hand restored from a saved game', () => {
    const restored = restoredDealHandNumber(true, 7);
    expect(restored).toBe(7);
    expect(shouldAnimateDeal(false, 7, restored)).toBe(false);
  });

  it('animates every later hand after a resume', () => {
    const restored = restoredDealHandNumber(true, 7);
    expect(shouldAnimateDeal(false, 8, restored)).toBe(true);
    expect(shouldAnimateDeal(false, 12, restored)).toBe(true);
  });

  it('animates the first hand in a new non-resumed session', () => {
    const restored = restoredDealHandNumber(false, 1);
    expect(restored).toBe(-1);
    expect(shouldAnimateDeal(false, 1, restored)).toBe(true);
  });

  it('never animates when table animations are disabled', () => {
    const restored = restoredDealHandNumber(true, 3);
    expect(shouldAnimateDeal(true, 4, restored)).toBe(false);
  });
});
