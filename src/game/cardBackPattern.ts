/**
 * The line work printed on the back of a card.
 *
 * A real card back is not a flat colour, it is a dense repeating engraving:
 * a diagonal lattice over the whole card with a scalloped medallion in the
 * middle. Ours were a plain gradient, which is why they read as coloured
 * rectangles rather than as cards.
 *
 * None of this copies an existing deck. A diamond lattice and a guilloche
 * rosette are the generic vocabulary of engraved security printing, drawn here
 * from geometry rather than traced from anyone's artwork, so there is no
 * licence attached to any of it.
 *
 * Everything is derived from the card's width, so one design holds together
 * from an 18pt opponent card to an 86pt hole card.
 */

export interface PatternLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LatticeTile {
  /** Side of the repeating square, in points. */
  pitch: number;
  /** The heavy diagonals that form the diamonds. */
  primary: PatternLine[];
  /** Finer diagonals halfway between, which make it read as printed. */
  secondary: PatternLine[];
  /** Radius of the dot where the diagonals cross. */
  dot: number;
  primaryStroke: number;
  secondaryStroke: number;
}

/**
 * How many diamonds span the card's width.
 *
 * Fixed as a count rather than a spacing so the pattern scales with the card
 * instead of turning into either stripes on a small card or wallpaper on a
 * large one.
 */
export const LATTICE_REPEATS = 6.5;

/**
 * A single repeating square of the lattice.
 *
 * The tile is seamless: every line either runs corner to corner or is paired
 * with the piece that completes it across the tile edge, so tiling leaves no
 * seam and no doubled line.
 */
export function latticeTile(width: number): LatticeTile {
  const pitch = width / LATTICE_REPEATS;
  const h = pitch / 2;
  return {
    pitch,
    // The two full diagonals. Tiled, these are the diamond grid.
    primary: [
      { x1: 0, y1: 0, x2: pitch, y2: pitch },
      { x1: 0, y1: pitch, x2: pitch, y2: 0 },
    ],
    /*
     * The same grid shifted half a tile. Each diagonal leaves the tile and has
     * to come back as a second segment, or the weave breaks at every edge.
     */
    secondary: [
      { x1: 0, y1: h, x2: h, y2: 0 },
      { x1: h, y1: pitch, x2: pitch, y2: h },
      { x1: 0, y1: h, x2: h, y2: pitch },
      { x1: h, y1: 0, x2: pitch, y2: h },
    ],
    dot: Math.max(0.35, width * 0.012),
    // Floors keep the engraving from vanishing entirely on an opponent's card.
    primaryStroke: Math.max(0.3, width * 0.0115),
    secondaryStroke: Math.max(0.25, width * 0.007),
  };
}

/**
 * A guilloche rosette: a circle with a sine wave run around its rim.
 *
 * `r(t) = radius * (1 + amplitude * cos(petals * t))`, sampled densely enough
 * that the scallops stay smooth at the largest card we draw.
 */
export function rosettePath(
  cx: number,
  cy: number,
  radius: number,
  petals = 12,
  amplitude = 0.12,
  samples = 144,
): string {
  const pts: string[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * Math.PI * 2;
    const r = radius * (1 + amplitude * Math.cos(petals * t));
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `${pts.join('')}Z`;
}

export interface RosetteRing {
  d: string;
  stroke: number;
  opacity: number;
}

/**
 * The medallion in the middle of the card.
 *
 * Three rosettes turned against each other, which is what gives engraved
 * printing its moire without needing a bitmap. The suit disc sits on top of
 * these, so they are drawn inside its radius and never fight the glyph.
 */
export function rosetteRings(cx: number, cy: number, radius: number): RosetteRing[] {
  /*
   * The floor has to be applied per ring, not once to a base width. The inner
   * rings are deliberately finer than the outer one, so scaling a floored base
   * by 0.8 and 0.7 put them back under it, and on an 18pt card they thinned
   * out to nothing while the outer ring stayed put.
   */
  const stroke = (scale: number) => Math.max(0.3, radius * 0.045 * scale);
  return [
    { d: rosettePath(cx, cy, radius, 12, 0.12), stroke: stroke(1), opacity: 0.55 },
    { d: rosettePath(cx, cy, radius * 0.82, 12, -0.14), stroke: stroke(0.8), opacity: 0.42 },
    { d: rosettePath(cx, cy, radius * 0.6, 8, 0.16), stroke: stroke(0.7), opacity: 0.32 },
  ];
}
