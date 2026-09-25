import { describe, expect, it } from 'vitest';
import { accentRamp, luminance, onColor, shade, tint } from '../color';

/**
 * These drive every icon badge in the app, so a mistake here shows up as a
 * washed out or unreadable tile rather than as a crash.
 */

describe('tint and shade', () => {
  it('leaves a colour alone at zero', () => {
    expect(tint('#159FE3', 0)).toBe('#159FE3');
    expect(shade('#159FE3', 0)).toBe('#159FE3');
  });

  it('reaches white and black at one', () => {
    expect(tint('#159FE3', 1)).toBe('#FFFFFF');
    expect(shade('#159FE3', 1)).toBe('#000000');
  });

  it('moves toward the target without overshooting', () => {
    expect(luminance(tint('#159FE3', 0.3))).toBeGreaterThan(luminance('#159FE3'));
    expect(luminance(shade('#159FE3', 0.3))).toBeLessThan(luminance('#159FE3'));
  });

  it('accepts shorthand hex and is case insensitive', () => {
    expect(tint('#fff', 0)).toBe('#FFFFFF');
    expect(shade('#000', 0)).toBe('#000000');
    expect(tint('#15a0e3', 0)).toBe(tint('#15A0E3', 0));
  });

  it('never leaves the byte range', () => {
    for (const hex of ['#000000', '#FFFFFF', '#159FE3', '#F0B42A']) {
      for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
        expect(tint(hex, amount)).toMatch(/^#[0-9A-F]{6}$/);
        expect(shade(hex, amount)).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});

describe('onColor', () => {
  it('picks readable content for dark and light backgrounds', () => {
    expect(onColor('#0A6B9E')).toBe('#FFFFFF');
    expect(onColor('#FFFFFF')).toBe('#1B2630');
  });
});

describe('accentRamp', () => {
  it('runs light to deep, so the badge reads as lit from above', () => {
    const [top, bottom] = accentRamp('#159FE3');
    expect(luminance(top)).toBeGreaterThan(luminance('#159FE3'));
    expect(luminance(bottom)).toBeLessThan(luminance('#159FE3'));
  });

  it('keeps the ramp subtle enough to stay one colour', () => {
    for (const hex of ['#159FE3', '#F0B42A', '#ED5B92', '#13B3A6', '#7C5CF2']) {
      const [top, bottom] = accentRamp(hex);
      // A ramp spanning too much range stops reading as a single accent.
      expect(luminance(top) - luminance(bottom)).toBeLessThan(0.45);
    }
  });
});
