import { describe, expect, it } from 'vitest';
import { compactChipCount, MAX_COMPACT_CHIPS, POT_SIZE_TIERS, potFontSize, shade, vivid } from '../chipStackLook';

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

describe('potFontSize', () => {
  const BB = 20;

  it('grows with the pot', () => {
    const sizes = [1, 10, 25, 60, 150, 400].map((bb) => potFontSize(bb * BB, BB));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
    expect(sizes[sizes.length - 1]).toBeGreaterThan(sizes[0]);
  });

  /*
   * The point of measuring in big blinds. 1,000 is a monster at 5/10 and a
   * limp at 500/1000, so the same chip count must not read the same way.
   */
  it('judges a pot against the stakes, not against a chip count', () => {
    expect(potFontSize(1000, 10)).toBeGreaterThan(potFontSize(1000, 1000));
  });

  it('is stable inside a tier, so the pill does not reflow on every bet', () => {
    expect(potFontSize(30 * BB, BB)).toBe(potFontSize(40 * BB, BB));
  });

  it('falls back to the smallest size for an empty or nonsense pot', () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(potFontSize(amount, BB)).toBe(POT_SIZE_TIERS[0].fontSize);
    }
  });

  it('survives a nonsense big blind rather than exploding the type size', () => {
    for (const bb of [0, -10, Number.NaN]) {
      const size = potFontSize(500, bb);
      expect(Number.isFinite(size)).toBe(true);
      expect(size).toBeLessThanOrEqual(POT_SIZE_TIERS[POT_SIZE_TIERS.length - 1].fontSize);
    }
  });

  it('never exceeds the largest tier', () => {
    expect(potFontSize(10_000_000, BB)).toBe(POT_SIZE_TIERS[POT_SIZE_TIERS.length - 1].fontSize);
  });
});

describe('shade and vivid', () => {
  it('lightens towards white and darkens towards black', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
  });

  it('clamps beyond the ends rather than wrapping', () => {
    expect(shade('#336699', 5)).toBe('#ffffff');
    expect(shade('#336699', -5)).toBe('#000000');
  });

  it('accepts short hex and is case insensitive', () => {
    expect(shade('#FFF', 0)).toBe('#ffffff');
    expect(shade('abc', 0)).toBe('#aabbcc');
  });

  /*
   * A palette is data. A bad entry should show up as a flat chip, never as a
   * crash in the middle of a hand.
   */
  it('returns a bad colour untouched instead of throwing', () => {
    for (const bad of ['', 'nonsense', '#12345', 'rgb(1,2,3)']) {
      expect(shade(bad, 0.5)).toBe(bad);
      expect(vivid(bad)).toBe(bad);
    }
  });

  it('pushes a colour away from grey without leaving the byte range', () => {
    const out = vivid('#c05050', 0.4);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    for (let i = 1; i < 7; i += 2) {
      const channel = parseInt(out.slice(i, i + 2), 16);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it('leaves a true grey grey, since it has no hue to push', () => {
    expect(vivid('#808080', 0.5)).toBe('#808080');
  });
});
