import { describe, expect, it } from 'vitest';
import { compactChipCount, MAX_COMPACT_CHIPS } from '../chipStackLook';

describe('compactChipCount', () => {
  it('draws nothing for nothing', () => {
    expect(compactChipCount(0)).toBe(0);
    expect(compactChipCount(-10)).toBe(0);
    expect(compactChipCount(Number.NaN)).toBe(0);
  });

  it('always draws at least one chip for a real amount', () => {
    expect(compactChipCount(1)).toBe(1);
    expect(compactChipCount(3)).toBe(1);
  });

  it('adds a chip every time the amount quadruples', () => {
    expect(compactChipCount(4)).toBe(2);
    expect(compactChipCount(16)).toBe(3);
    expect(compactChipCount(64)).toBe(4);
    expect(compactChipCount(256)).toBe(5);
    expect(compactChipCount(1024)).toBe(6);
  });

  it('never grows past the point where it would cover the pod', () => {
    expect(compactChipCount(10_000)).toBe(MAX_COMPACT_CHIPS);
    expect(compactChipCount(Number.MAX_SAFE_INTEGER)).toBe(MAX_COMPACT_CHIPS);
  });

  it('never shrinks as the amount grows', () => {
    let last = 0;
    for (let amount = 1; amount < 50_000; amount += 37) {
      const n = compactChipCount(amount);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  /*
   * The bug this exists for: a pod showing 20 and a pod showing 20,000 drew
   * the same single chip, so the picture said nothing and only the text did.
   */
  it('tells a small stack apart from a big one', () => {
    expect(compactChipCount(20_000)).toBeGreaterThan(compactChipCount(20));
    expect(compactChipCount(5_000)).toBeGreaterThan(compactChipCount(100));
  });
});
