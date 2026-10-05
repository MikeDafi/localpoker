import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scaleLargeTextSize } from '../largeTextCurve';

const SRC = join(__dirname, '..', '..');

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

const realFontSizes = (): number[] => {
  const sizes = new Set<number>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/fontSize:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
      sizes.add(Number(match[1]!));
    }
  }
  return [...sizes].sort((a, b) => a - b);
};

describe('Large Text curve', () => {
  it('lifts small text meaningfully toward the readable floor', () => {
    expect(scaleLargeTextSize(11)).toBeGreaterThanOrEqual(14);
    expect(scaleLargeTextSize(12)).toBeGreaterThanOrEqual(14.5);
    expect(scaleLargeTextSize(13) - 13).toBeGreaterThan(1.5);
  });

  it('leaves large text roughly where it is', () => {
    expect(scaleLargeTextSize(18)).toBe(18);
    expect(scaleLargeTextSize(22)).toBe(22);
    expect(scaleLargeTextSize(40)).toBe(40);
  });

  it('never shrinks real app font sizes', () => {
    const sizes = realFontSizes();
    expect(sizes.length).toBeGreaterThan(20);
    for (const size of sizes) {
      expect(scaleLargeTextSize(size), `${size}`).toBeGreaterThanOrEqual(size);
    }
  });

  it('preserves ordering across the real range of app font sizes', () => {
    const sizes = realFontSizes();
    expect(sizes[0]!).toBeLessThanOrEqual(9);
    expect(sizes[sizes.length - 1]!).toBeGreaterThanOrEqual(40);
    for (let i = 1; i < sizes.length; i += 1) {
      const smaller = sizes[i - 1]!;
      const larger = sizes[i]!;
      expect(scaleLargeTextSize(smaller), `${smaller} before ${larger}`)
        .toBeLessThan(scaleLargeTextSize(larger));
    }
  });

  it('keeps a caption below a heading after rounding in Text styles', () => {
    expect(Math.round(scaleLargeTextSize(12))).toBeLessThan(Math.round(scaleLargeTextSize(20)));
    expect(Math.round(scaleLargeTextSize(16))).toBeLessThanOrEqual(Math.round(scaleLargeTextSize(26)));
  });

  it('is stable for nonsense input', () => {
    for (const value of [0, -4, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(Object.is(scaleLargeTextSize(value), value), `${value}`).toBe(true);
    }
  });
});
