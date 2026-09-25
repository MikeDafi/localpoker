/**
 * Small hex colour maths, so accents can be brightened or deepened from a
 * single token instead of every component hard-coding a second hex that drifts
 * out of step with the first.
 *
 * Deliberately tiny and dependency-free: the app ships one accent per surface
 * and needs a lighter top and a darker bottom for gradients, nothing more.
 */

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const parse = (hex: string): [number, number, number] => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Mix a colour toward white. `amount` is 0 (unchanged) to 1 (white). */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Mix a colour toward black. `amount` is 0 (unchanged) to 1 (black). */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/**
 * Relative luminance, per WCAG. Used to decide whether a badge needs light or
 * dark content on top of it, rather than guessing per accent.
 */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const channel = v / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or near-black, whichever reads better on the given background. */
export function onColor(hex: string, light = '#FFFFFF', dark = '#1B2630'): string {
  return luminance(hex) > 0.55 ? dark : light;
}

/**
 * The top and bottom of an accent gradient. A flat fill reads as a sticker;
 * a light-to-deep ramp is what makes the badge look lit.
 */
export function accentRamp(hex: string): [string, string] {
  return [tint(hex, 0.12), shade(hex, 0.18)];
}
