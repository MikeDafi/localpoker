/**
 * How tall a chip stack looks for a given amount.
 *
 * The compact stack, which is what a pod and a bet pill draw, was a single
 * chip whatever the number next to it said. A pile of 20 and a pile of 20,000
 * were the same picture, so the only thing carrying the size was the text,
 * and the chips were decoration.
 *
 * A stack is read as a quantity before the number next to it is, so it has to
 * grow. It grows by magnitude rather than by count: nobody can tally eleven
 * chips at this size, but everybody can see that one pile is twice the height
 * of another.
 */

/** Past this it stops reading as a stack and starts overlapping the pod. */
export const MAX_COMPACT_CHIPS = 6;

/**
 * One chip, and one more every time the amount quadruples.
 *
 * Quadrupling rather than doubling because a poker stack covers a very wide
 * range: at a 50/100 table a blind and a deep stack are three orders of
 * magnitude apart, and doubling would hit the ceiling almost immediately and
 * make every meaningful bet look identical again.
 */
export function compactChipCount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const steps = 1 + Math.floor(Math.log(amount) / Math.log(4));
  return Math.max(1, Math.min(MAX_COMPACT_CHIPS, steps));
}

/**
 * Lighten or darken a hex colour.
 *
 * A chip was being filled with one flat colour, which is why it read as a
 * counter rather than as an object: a real chip is a curved, glossy thing, so
 * the top of its face catches the light and the bottom of its wall falls into
 * shadow. Both of those are this colour shifted, so they have to be derived
 * from the palette rather than painted over it with translucent white, which
 * is what washes a vivid chip out to pastel.
 *
 * `amount` runs -1 (black) to 1 (white). Anything unparseable comes back
 * untouched, because a palette is data and a bad entry should show up as a
 * flat chip rather than as a crash mid-hand.
 */
export function shade(hex: string, amount: number): string {
  const parsed = parseHex(hex);
  if (!parsed) return hex;
  const t = Math.max(-1, Math.min(1, amount));
  const target = t >= 0 ? 255 : 0;
  const mix = Math.abs(t);
  const channel = (c: number) => Math.round(c + (target - c) * mix);
  const [r, g, b] = parsed;
  return `#${[channel(r), channel(g), channel(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Push a colour towards its most saturated form at the same lightness.
 *
 * The chip palettes are muted enough that several denominations read as the
 * same grey-ish disc under the table's dim lighting. Saturating the face, and
 * only the face, keeps the palette recognisable while making the colour
 * actually arrive.
 */
export function vivid(hex: string, amount = 0.35): string {
  const parsed = parseHex(hex);
  if (!parsed) return hex;
  const [r, g, b] = parsed;
  const mix = Math.max(0, Math.min(1, amount));
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const channel = (c: number) => Math.round(Math.max(0, Math.min(255, c + (c - grey) * mix)));
  return `#${[channel(r), channel(g), channel(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  let body = hex.trim().replace(/^#/, '');
  if (body.length === 3) body = body.split('').map((c) => c + c).join('');
  if (body.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(body)) return null;
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/**
 * How big the pot figure is drawn, by how big the pot is.
 *
 * A pot of 30 and a pot of 30,000 were printed at the same size, so the one
 * number on the table that says how much the hand matters said it only in
 * digits you had to stop and read. Size carries it before the digits do.
 *
 * Tiers rather than a continuous scale: a smoothly growing number is never
 * quite the same size twice, which reads as drift rather than as meaning, and
 * it would reflow the pill on nearly every bet.
 *
 * Measured in big blinds, not in chips, because 1,000 is a monster at 5/10
 * and a limp at 500/1000. A pot is big or small relative to the stakes.
 */
export const POT_SIZE_TIERS = [
  { bigBlinds: 0, fontSize: 22 },
  { bigBlinds: 8, fontSize: 26 },
  { bigBlinds: 25, fontSize: 31 },
  { bigBlinds: 60, fontSize: 36 },
  { bigBlinds: 150, fontSize: 42 },
] as const;

export function potFontSize(amount: number, bigBlind: number): number {
  const base: number = POT_SIZE_TIERS[0].fontSize;
  if (!Number.isFinite(amount) || amount <= 0) return base;
  // A nonsense big blind must not turn the pot into a screenful of digits.
  const bb = Number.isFinite(bigBlind) && bigBlind > 0 ? bigBlind : 1;
  const inBigBlinds = amount / bb;
  let size = base;
  for (const tier of POT_SIZE_TIERS) {
    if (inBigBlinds >= tier.bigBlinds) size = tier.fontSize;
  }
  return size;
}
