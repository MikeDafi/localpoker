import { SUIT_ASPECT, SUIT_PATH } from './suitPaths';
import type { Suit } from './suitPaths';

export type { Suit };
export { SUIT_ASPECT, SUIT_PATH };

/**
 * Where everything sits on the face of a playing card.
 *
 * These are not invented proportions. They were measured off the CC0
 * English-pattern artwork that `suitPaths` takes its outlines from, and the
 * numbers turned out to be a strikingly regular grid:
 *
 *   - pips sit in three columns at ¼, ½ and ¾ of the card's width;
 *   - pip rows land on odd eighteenths of the card's height — 3, 5, 7, 9, 11,
 *     13, 15 — which is why a ten's four side rows (3, 7, 11, 15) interleave
 *     perfectly with its two centre pips (5, 13);
 *   - a pip is ⅙ of the card's width across and ¼ tall, so exactly 2:3;
 *   - the corner index is half-scale: a ¹⁄₁₂-width suit under the rank.
 *
 * The previous card drew one oversized suit symbol in the middle and nothing
 * else, so a ten of diamonds and a three of diamonds were the same picture with
 * a different corner number. Real cards let you read the rank by *counting*,
 * and that is most of what makes a card look like a card rather than an icon of
 * one.
 *
 * The one deliberate departure from the source: rows are expressed as fractions
 * of card height, and this app's cards are 1:1.42 where the artwork is 2:3. A
 * 1.42 card is actually closer to a real 2.5×3.5in poker card than the artwork
 * is, so the grid is kept proportional rather than copied in absolute terms,
 * and the pips simply sit a little closer together vertically.
 */

/** This app's card proportion: width × `CARD_RATIO` = height. */
export const CARD_RATIO = 1.42;

export const RANK_LABEL: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

/** Pip columns, as a fraction of card width. */
const COL = { left: 0.25, mid: 0.5, right: 0.75 } as const;

/** A pip's size, as a fraction of card width. */
const PIP_W = 1 / 6;
const PIP_H = 0.25;

/** The lone pip on an ace is printed larger, the way a real deck does it. */
const ACE_SCALE = 1.8;

export interface Pip {
  /** Centre, as a fraction of the card's width. */
  x: number;
  /** Centre, as a fraction of the card's height. */
  y: number;
  /** Pips below the middle are printed upside down, so the card reads both ways. */
  inverted: boolean;
  /** Multiplier on the standard pip size. */
  scale: number;
}

/** Column and row (in eighteenths of card height) for every pip of each rank. */
const LAYOUT: Record<number, [number, number][]> = {
  2: [[COL.mid, 3], [COL.mid, 15]],
  3: [[COL.mid, 3], [COL.mid, 9], [COL.mid, 15]],
  4: [[COL.left, 3], [COL.right, 3], [COL.left, 15], [COL.right, 15]],
  5: [[COL.left, 3], [COL.right, 3], [COL.mid, 9], [COL.left, 15], [COL.right, 15]],
  6: [
    [COL.left, 3], [COL.right, 3],
    [COL.left, 9], [COL.right, 9],
    [COL.left, 15], [COL.right, 15],
  ],
  // The seventh and eighth pips go midway between the rows already there,
  // which is what stops a seven reading as a lopsided six.
  7: [
    [COL.left, 3], [COL.right, 3],
    [COL.mid, 6],
    [COL.left, 9], [COL.right, 9],
    [COL.left, 15], [COL.right, 15],
  ],
  8: [
    [COL.left, 3], [COL.right, 3],
    [COL.mid, 6],
    [COL.left, 9], [COL.right, 9],
    [COL.mid, 12],
    [COL.left, 15], [COL.right, 15],
  ],
  // Nines and tens tighten the side columns to four rows to make room.
  9: [
    [COL.left, 3], [COL.right, 3],
    [COL.left, 7], [COL.right, 7],
    [COL.mid, 9],
    [COL.left, 11], [COL.right, 11],
    [COL.left, 15], [COL.right, 15],
  ],
  10: [
    [COL.left, 3], [COL.right, 3],
    [COL.mid, 5],
    [COL.left, 7], [COL.right, 7],
    [COL.left, 11], [COL.right, 11],
    [COL.mid, 13],
    [COL.left, 15], [COL.right, 15],
  ],
  14: [[COL.mid, 9]],
};

/**
 * The court figure artwork's aspect ratio (width / height).
 *
 * A property of the generated PNGs rather than a choice, so `courtArt.test.ts`
 * measures the real files and fails if they stop matching. It lives here rather
 * than beside the images because `courtArt.ts` is nothing but `require()` calls,
 * which only Metro can resolve — importing it from a test crashes the runner.
 */
export const COURT_ASPECT = 200 / 319;

/** True for ranks drawn as a court card rather than by counting pips. */
export function isCourt(rank: number): boolean {
  return rank >= 11 && rank <= 13;
}

/**
 * The pips for a rank, in normalised card coordinates.
 *
 * Court cards have none — they are a picture, not a count — and an ace has one,
 * printed large.
 */
export function pipLayout(rank: number): Pip[] {
  const cells = LAYOUT[rank];
  if (!cells) return [];
  return cells.map(([x, row]) => ({
    x,
    y: row / 18,
    inverted: row > 9,
    scale: rank === 14 ? ACE_SCALE : 1,
  }));
}

export interface FaceGeometry {
  w: number;
  h: number;
  /** The standard body pip, in px. */
  pip: { w: number; h: number };
  index: {
    /** Centre of the top-left index; the bottom-right one mirrors it. */
    x: number;
    y: number;
    /** Height of the rank's digits, and the font size that produces it. */
    rankCap: number;
    rankFont: number;
    /** Baseline for the rank, so the digits centre on `y`. */
    rankBaseline: number;
    suitY: number;
    suitH: number;
  };
  court: {
    /**
     * Where the court figure artwork sits.
     *
     * Measured off the source deck: the figure panel runs from 0.080 to 0.920
     * across its card and 0.054 to 0.946 down it. Kept as fractions rather than
     * absolute sizes because the source cards are 2:3 and these are 1:1.42 —
     * the artwork is fitted inside this box preserving its own aspect, so a
     * shorter card gives a slightly narrower figure rather than a squashed one.
     */
    art: { x: number; y: number; w: number; h: number };
  };
  /** The widest the index may be drawn before it crowds the pips. */
  indexRoom: number;
}

/**
 * Cap height as a fraction of font size.
 *
 * Text is positioned by its baseline, but the thing that has to line up is the
 * height of the digits, so every index and letter here is specified by cap
 * height and converted once. The ratio is a typical value for the system UI
 * face; it only has to be close, because it is used consistently for both the
 * size and the baseline offset and so cannot make the glyph sit off-centre.
 */
const CAP_RATIO = 0.715;

/**
 * The card's index is drawn a little larger than the source artwork's.
 *
 * Faithfully scaled, the corner of a 40pt board card gives digits barely three
 * points tall, and the whole point of a board card is being read at a glance
 * from across the screen. Casinos solved this the same way with jumbo-index
 * decks; this is the same compromise and it is the only measurement here that
 * is not straight off the reference.
 *
 * It cannot go much further than this. The reference deck's digits are drawn
 * far narrower than any normal typeface's, so at equal height ours take much
 * more width — and the index has only the strip between the card's edge and the
 * first pip column to live in.
 */
const INDEX_CAP = 0.15;

/**
 * Breathing room kept between the index and the first pip column.
 *
 * Without it the index is allowed to grow until it exactly touches the pips,
 * which passes a non-overlap check and still looks like a printing error.
 */
const INDEX_GAP = 0.022;

/** Where the index column sits, as a fraction of card width. */
const INDEX_X = 0.0833;
/** Where the first pip column's left edge falls. */
const PIP_LEFT = COL.left - PIP_W / 2;

export function faceGeometry(size: number): FaceGeometry {
  const w = size;
  const h = size * CARD_RATIO;
  const rankCap = INDEX_CAP * w;
  // The index is centred in the strip between the card's edge and the first pip
  // column, so how wide it may be drawn is how much of that strip it can fill
  // without closing the gap.
  const indexRoom = 2 * (PIP_LEFT - INDEX_X - INDEX_GAP) * w;
  return {
    w,
    h,
    pip: { w: PIP_W * w, h: PIP_H * w },
    indexRoom,
    index: {
      x: INDEX_X * w,
      y: 0.1019 * h,
      rankCap,
      rankFont: rankCap / CAP_RATIO,
      rankBaseline: 0.1019 * h + rankCap / 2,
      suitY: 0.2083 * h,
      suitH: 0.125 * w,
    },
    court: {
      art: { x: 0.08036 * w, y: 0.05351 * h, w: 0.83928 * w, h: 0.89279 * h },
    },
  };
}

/**
 * A suit pip as an SVG transform, placing the normalised outline at `(cx, cy)`
 * with the given height.
 *
 * The outlines are a unit tall and centred on their own bounding box, so one
 * scale and one translate put a pip anywhere; `inverted` adds the half-turn
 * that the bottom half of every card is printed with.
 */
export function pipTransform(cx: number, cy: number, height: number, inverted: boolean): string {
  const s = height.toFixed(4);
  return inverted
    ? `translate(${cx.toFixed(3)}, ${cy.toFixed(3)}) rotate(180) scale(${s})`
    : `translate(${cx.toFixed(3)}, ${cy.toFixed(3)}) scale(${s})`;
}

/** The width a pip of the given height occupies, for collision checks. */
export function pipWidth(suit: Suit, height: number): number {
  return height * SUIT_ASPECT[suit];
}

/**
 * Roughly how wide one character of the rank is, as a multiple of font size.
 *
 * Only used to decide whether a label needs condensing, so an estimate is
 * enough — and it has to be an estimate, because the real advance width lives
 * inside the platform's font and is not available while laying out SVG.
 */
const CHAR_EM = 0.6;

/**
 * How far the index has to be squeezed horizontally to stay in its column.
 *
 * The column is the strip between the card's edge and where the pips begin,
 * less a margin so the two never touch. Everything except a ten fits it at
 * full width; a ten is two characters in a space meant for one, so it gets
 * condensed, which is precisely what real decks do (their tens are drawn with
 * separately kerned narrow digits rather than a normal "10" — in fact rather
 * more tightly than this).
 *
 * Squeezing rather than shrinking is deliberate: it keeps every rank's digits
 * the same *height*, so a ten and a nine read as equally important from across
 * the table. Dropping the font size instead would make the ten quietly
 * recede.
 */
export function indexScaleX(label: string, g: FaceGeometry): number {
  const natural = label.length * CHAR_EM * g.index.rankFont;
  return Math.min(1, g.indexRoom / natural);
}

/** The drawn width of an index label, after any condensing. */
export function indexWidth(label: string, g: FaceGeometry): number {
  const natural = label.length * CHAR_EM * g.index.rankFont;
  return Math.min(natural, g.indexRoom);
}
