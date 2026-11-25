import { describe, expect, it } from 'vitest';
import {
  averageStartingStack,
  chipStackGeometry,
  compactChipCount,
  MAX_COMPACT_CHIPS,
  POT_SIZE_TIERS,
  potFontSize,
  shade,
  vivid,
} from '../chipStackLook';

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
  // A table where everybody started the hand with 2,000.
  const STACK = 2000;
  const share = (fraction: number) => fraction * STACK;

  it('grows with the pot', () => {
    const sizes = [0.01, 0.1, 0.3, 0.6, 1, 3].map((f) => potFontSize(share(f), STACK));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
    expect(sizes[sizes.length - 1]).toBeGreaterThan(sizes[0]);
  });

  /*
   * The tester's point. The same 60bb pot is most of the table for players
   * who sat down with 40bb and a routine pot for players with 400bb, so it
   * must not read the same way.
   */
  it('judges a pot against the stacks in play, not against the blinds', () => {
    const BB = 20;
    expect(potFontSize(60 * BB, 40 * BB)).toBeGreaterThan(potFontSize(60 * BB, 400 * BB));
  });

  it('is as loud as it gets once the pot is worth a whole stack', () => {
    const top = POT_SIZE_TIERS[POT_SIZE_TIERS.length - 1].fontSize;
    expect(potFontSize(share(1), STACK)).toBe(top);
    expect(potFontSize(share(0.4), STACK)).toBeLessThan(top);
  });

  it('is stable inside a tier, so the pill does not reflow on every bet', () => {
    expect(potFontSize(share(0.35), STACK)).toBe(potFontSize(share(0.5), STACK));
  });

  it('falls back to the smallest size for an empty or nonsense pot', () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(potFontSize(amount, STACK)).toBe(POT_SIZE_TIERS[0].fontSize);
    }
  });

  it('stays at the smallest size with nothing to measure against', () => {
    for (const stack of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(potFontSize(500, stack)).toBe(POT_SIZE_TIERS[0].fontSize);
    }
  });

  it('never exceeds the largest tier', () => {
    expect(potFontSize(10_000_000, STACK)).toBe(POT_SIZE_TIERS[POT_SIZE_TIERS.length - 1].fontSize);
  });

  it('leaves top-tier pot text unchanged on a large phone', () => {
    expect(potFontSize(share(0.7), STACK, 440)).toBe(36);
    expect(potFontSize(share(2), STACK, 440)).toBe(42);
  });

  it('shrinks only the top tiers on a narrow phone', () => {
    expect(potFontSize(share(0.4), STACK, 375)).toBe(31);
    expect(potFontSize(share(0.7), STACK, 375)).toBeLessThan(36);
    expect(potFontSize(share(2), STACK, 375)).toBeLessThan(42);
  });

  it('scales the narrow-phone shrink between SE and Pro Max widths', () => {
    const se = potFontSize(share(2), STACK, 375);
    const regular = potFontSize(share(2), STACK, 393);
    const max = potFontSize(share(2), STACK, 440);
    expect(se).toBeLessThan(regular);
    expect(regular).toBeLessThan(max);
  });
});

describe('averageStartingStack', () => {
  const seat = (id: string, chips: number, extra: { folded?: boolean; sittingOut?: boolean; dealt?: boolean } = {}) => ({
    id,
    chips,
    holeCards: extra.dealt === false ? [] : [1, 2],
    folded: extra.folded,
    sittingOut: extra.sittingOut,
  });

  it('adds back what each player has already put in, so it does not shrink as the pot grows', () => {
    const before = averageStartingStack([seat('a', 1000), seat('b', 3000)], {});
    const after = averageStartingStack([seat('a', 600), seat('b', 2600)], { a: 400, b: 400 });
    expect(before).toBe(2000);
    expect(after).toBe(before);
  });

  it('keeps a folded player, so a fold does not resize the pot', () => {
    const live = averageStartingStack([seat('a', 900), seat('b', 900), seat('c', 1000)], { a: 100, b: 100 });
    const folded = averageStartingStack([seat('a', 900), seat('b', 900), seat('c', 1000, { folded: true })], { a: 100, b: 100 });
    expect(folded).toBe(live);
  });

  it('ignores seats that were not dealt in', () => {
    expect(averageStartingStack([
      seat('a', 1000),
      seat('b', 50_000, { sittingOut: true }),
      seat('c', 50_000, { dealt: false }),
    ], {})).toBe(1000);
  });

  it('is zero for an empty table rather than a division by zero', () => {
    expect(averageStartingStack([], {})).toBe(0);
  });
});

describe('chipStackGeometry', () => {
  it('uses an ellipse for the top face and a separate wall for depth', () => {
    const geometry = chipStackGeometry(26, 4);
    expect(geometry.faceRy).toBeLessThan(geometry.rx);
    expect(geometry.wallHeight).toBeGreaterThan(geometry.faceRy * 0.8);
    expect(geometry.height).toBeCloseTo(geometry.faceRy * 2 + geometry.wallHeight + geometry.chipStep * 3);
  });

  it('returns wall slices from bottom to top so upper chips occlude lower chips', () => {
    const geometry = chipStackGeometry(30, 5);
    expect(geometry.walls).toHaveLength(5);
    expect(geometry.walls[0].chipIndexFromTop).toBe(4);
    expect(geometry.walls[0].faceCy).toBeGreaterThan(geometry.walls[geometry.walls.length - 1].faceCy);
    expect(geometry.walls[geometry.walls.length - 1].chipIndexFromTop).toBe(0);
  });

  it('gives each visible chip segment its own seam geometry at 28pt', () => {
    const geometry = chipStackGeometry(28, 5);
    const topToBottom = geometry.walls.slice().reverse();
    expect(geometry.drawSeams).toBe(true);
    expect(geometry.seamStrokeWidth).toBeGreaterThanOrEqual(0.75);
    for (let i = 0; i < topToBottom.length; i += 1) {
      const wall = topToBottom[i];
      const expectedHeight = i === topToBottom.length - 1 ? geometry.wallHeight : geometry.chipStep;
      expect(wall.visibleHeight).toBeCloseTo(expectedHeight);
      expect(wall.baseShadowPath).not.toBe(wall.topLipPath);
    }
  });

  it('curves edge spots along every visible wall', () => {
    const geometry = chipStackGeometry(24, 3);
    for (const wall of geometry.walls) {
      expect(wall.spotPaths).toHaveLength(5);
      for (const path of wall.spotPaths) {
        expect(path).toContain(`A${geometry.rx},${geometry.faceRy}`);
      }
    }
  });

  it('keeps edge spots separate per chip instead of one continuous stripe', () => {
    const geometry = chipStackGeometry(28, 3);
    const topToBottom = geometry.walls.slice().reverse();
    expect(topToBottom[0].spotPaths[2]).not.toBe(topToBottom[1].spotPaths[2]);
    expect(topToBottom[1].spotPaths[2]).not.toBe(topToBottom[2].spotPaths[2]);
  });

  it('drops seam strokes below the legible size instead of drawing noise', () => {
    const geometry = chipStackGeometry(18, 5);
    expect(geometry.drawSeams).toBe(false);
    expect(geometry.seamStrokeWidth).toBe(0);
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
