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

export interface ChipWallGeometry {
  /** Zero is the top chip. Higher numbers sit lower and farther back. */
  chipIndexFromTop: number;
  faceCy: number;
  visibleHeight: number;
  path: string;
  frontRimPath: string;
  topLipPath: string;
  baseShadowPath: string;
  spotPaths: string[];
  shadowOpacity: number;
}

export interface ChipStackGeometry {
  width: number;
  height: number;
  rx: number;
  faceRy: number;
  wallHeight: number;
  chipStep: number;
  topFaceCy: number;
  rimRx: number;
  rimRy: number;
  centerRx: number;
  centerRy: number;
  glossCx: number;
  glossCy: number;
  glossRx: number;
  glossRy: number;
  strokeWidth: number;
  dashLength: number;
  drawSeams: boolean;
  seamStrokeWidth: number;
  walls: ChipWallGeometry[];
}

/**
 * Geometry for a real stack, not a pile of full face-on discs.
 *
 * Lower chips only expose their cylindrical walls. Drawing every lower face is
 * the obvious shortcut, but it makes the stack read as a set of flat tokens
 * pasted on top of each other instead of one object receding in depth.
 */
export function chipStackGeometry(size: number, count: number): ChipStackGeometry {
  const width = roundGeometry(Number.isFinite(size) && size > 0 ? size : 22);
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const rx = roundGeometry(width / 2);
  const faceRy = roundGeometry(width * 0.26);
  const wallHeight = roundGeometry(Math.max(3, width * 0.24));
  const chipStep = roundGeometry(wallHeight * 0.72);
  const height = safeCount === 0 ? 0 : roundGeometry(faceRy * 2 + wallHeight + (safeCount - 1) * chipStep);
  const topFaceCy = faceRy;
  const drawSeams = safeCount > 1 && width >= 20;
  const seamStrokeWidth = drawSeams ? roundGeometry(Math.max(0.75, width * 0.035)) : 0;
  const seamInset = roundGeometry(seamStrokeWidth * 0.45);
  const walls: ChipWallGeometry[] = [];

  for (let chipIndexFromTop = safeCount - 1; chipIndexFromTop >= 0; chipIndexFromTop -= 1) {
    const faceCy = roundGeometry(topFaceCy + chipIndexFromTop * chipStep);
    const visibleHeight = roundGeometry(chipIndexFromTop === safeCount - 1 ? wallHeight : chipStep);
    walls.push({
      chipIndexFromTop,
      faceCy,
      visibleHeight,
      path: chipWallPath(width, rx, faceRy, faceCy, visibleHeight),
      frontRimPath: chipFrontRimPath(width, rx, faceRy, faceCy),
      topLipPath: chipFrontRimPath(width, rx, faceRy, faceCy + seamInset),
      baseShadowPath: chipFrontRimPath(width, rx, faceRy, faceCy + visibleHeight - seamInset),
      spotPaths: chipWallSpotPaths(width, rx, faceRy, faceCy, visibleHeight),
      shadowOpacity: roundGeometry(Math.min(0.2, chipIndexFromTop * 0.035)),
    });
  }

  return {
    width,
    height,
    rx,
    faceRy,
    wallHeight,
    chipStep,
    topFaceCy,
    rimRx: roundGeometry(rx * 0.77),
    rimRy: roundGeometry(faceRy * 0.7),
    centerRx: roundGeometry(rx * 0.5),
    centerRy: roundGeometry(faceRy * 0.43),
    glossCx: roundGeometry(rx * 0.72),
    glossCy: roundGeometry(faceRy * 0.55),
    glossRx: roundGeometry(rx * 0.54),
    glossRy: roundGeometry(faceRy * 0.36),
    strokeWidth: roundGeometry(Math.max(0.7, width * 0.04)),
    dashLength: roundGeometry(Math.max(1.4, width * 0.11)),
    drawSeams,
    seamStrokeWidth,
    walls,
  };
}

function chipWallPath(width: number, rx: number, ry: number, faceCy: number, wallHeight: number): string {
  return [
    `M0,${fmt(faceCy)}`,
    `A${fmt(rx)},${fmt(ry)} 0 0 0 ${fmt(width)},${fmt(faceCy)}`,
    `L${fmt(width)},${fmt(faceCy + wallHeight)}`,
    `A${fmt(rx)},${fmt(ry)} 0 0 1 0,${fmt(faceCy + wallHeight)}`,
    'Z',
  ].join(' ');
}

function chipFrontRimPath(width: number, rx: number, ry: number, faceCy: number): string {
  return `M0,${fmt(faceCy)} A${fmt(rx)},${fmt(ry)} 0 0 0 ${fmt(width)},${fmt(faceCy)}`;
}

function chipWallSpotPaths(width: number, rx: number, ry: number, faceCy: number, wallHeight: number): string[] {
  const spotWidth = Math.max(2, width * 0.13);
  const inset = Math.max(0.35, Math.min(0.8, wallHeight * 0.18));
  const spotHeight = Math.max(1, wallHeight - inset * 2);
  const centers = [0.16, 0.33, 0.5, 0.67, 0.84].map((t) => t * width);
  return centers.map((center) => {
    const x1 = roundGeometry(Math.max(0, center - spotWidth / 2));
    const x2 = roundGeometry(Math.min(width, center + spotWidth / 2));
    const topY1 = roundGeometry(frontArcY(x1, rx, ry, faceCy) + inset);
    const topY2 = roundGeometry(frontArcY(x2, rx, ry, faceCy) + inset);
    const bottomY1 = roundGeometry(topY1 + spotHeight);
    const bottomY2 = roundGeometry(topY2 + spotHeight);
    return [
      `M${fmt(x1)},${fmt(topY1)}`,
      `A${fmt(rx)},${fmt(ry)} 0 0 0 ${fmt(x2)},${fmt(topY2)}`,
      `L${fmt(x2)},${fmt(bottomY2)}`,
      `A${fmt(rx)},${fmt(ry)} 0 0 1 ${fmt(x1)},${fmt(bottomY1)}`,
      'Z',
    ].join(' ');
  });
}

function frontArcY(x: number, rx: number, ry: number, faceCy: number): number {
  const dx = (x - rx) / rx;
  return faceCy + ry * Math.sqrt(Math.max(0, 1 - dx * dx));
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fmt(value: number): string {
  return `${roundGeometry(value)}`;
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

const POT_NARROW_WIDTH = 375;
const POT_FULL_WIDTH = 430;

export function potFontSize(amount: number, bigBlind: number, screenWidth?: number): number {
  const base: number = POT_SIZE_TIERS[0].fontSize;
  if (!Number.isFinite(amount) || amount <= 0) return base;
  // A nonsense big blind must not turn the pot into a screenful of digits.
  const bb = Number.isFinite(bigBlind) && bigBlind > 0 ? bigBlind : 1;
  const inBigBlinds = amount / bb;
  let size = base;
  let tierIndex = 0;
  let i = 0;
  for (const tier of POT_SIZE_TIERS) {
    if (inBigBlinds >= tier.bigBlinds) {
      size = tier.fontSize;
      tierIndex = i;
    }
    i += 1;
  }
  return fitPotFontSizeToScreen(size, tierIndex, screenWidth);
}

function fitPotFontSizeToScreen(fontSize: number, tierIndex: number, screenWidth?: number): number {
  if (screenWidth === undefined || !Number.isFinite(screenWidth)) return fontSize;
  if (tierIndex < 3) return fontSize;
  const pressure = Math.max(0, Math.min(1, (POT_FULL_WIDTH - screenWidth) / (POT_FULL_WIDTH - POT_NARROW_WIDTH)));
  const maxShrink = tierIndex >= 4 ? 6 : 3;
  return fontSize - Math.round(maxShrink * pressure);
}
