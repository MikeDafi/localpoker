import { describe, expect, it } from 'vitest';
import { isRoundWager, roundWager, WAGER_STEP } from '../wager';

describe('roundWager', () => {
  it('snaps to the nearest round number', () => {
    expect(roundWager(368, 10, 2000)).toBe(370);
    expect(roundWager(1237, 10, 5000)).toBe(1240);
    expect(roundWager(654, 10, 2000)).toBe(650);
    expect(roundWager(45, 10, 2000)).toBe(50);
    expect(roundWager(44, 10, 2000)).toBe(40);
  });

  it('keeps an all-in exact', () => {
    // Rounding a shove down would leave chips behind; rounding up is illegal.
    expect(roundWager(1987, 20, 1987)).toBe(1987);
    expect(roundWager(99999, 20, 1987)).toBe(1987);
  });

  it('never returns less than the minimum', () => {
    // 12 would round down to 10, below a min-raise of 15.
    expect(roundWager(12, 15, 500)).toBe(20);
    expect(roundWager(15, 15, 500)).toBe(20);
  });

  it('never exceeds the maximum', () => {
    expect(roundWager(196, 10, 198)).toBe(190);
  });

  it('stays legal when no round number fits in the range', () => {
    // min 15, max 18: neither 10 nor 20 is legal, so it must not round at all.
    const v = roundWager(16, 15, 18);
    expect(v).toBeGreaterThanOrEqual(15);
    expect(v).toBeLessThanOrEqual(18);
  });

  it('is always legal across a sweep of ranges', () => {
    for (let min = 1; min < 60; min += 7) {
      for (let max = min; max < min + 300; max += 37) {
        for (let v = min; v <= max; v += Math.max(1, Math.floor((max - min) / 5) || 1)) {
          const r = roundWager(v, min, max);
          expect(r, `v=${v} min=${min} max=${max}`).toBeGreaterThanOrEqual(min);
          expect(r, `v=${v} min=${min} max=${max}`).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('produces round amounts whenever the range allows one', () => {
    // A comfortable range should always yield a number ending in zero.
    for (let v = 25; v < 900; v += 13) {
      expect(isRoundWager(roundWager(v, 10, 1000))).toBe(true);
    }
  });

  it('handles degenerate input', () => {
    expect(roundWager(Number.NaN, 20, 100)).toBe(20);
    expect(roundWager(50, 100, 100)).toBe(100);
  });

  it('exposes a step of 10', () => {
    expect(WAGER_STEP).toBe(10);
  });
});
