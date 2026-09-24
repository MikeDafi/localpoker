import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COURT_ASPECT } from '../cardFace';

/**
 * The court figures are the only part of the deck that is artwork rather than
 * geometry, so they are checked as files.
 *
 * `courtArt.ts` itself cannot be imported here: it is a list of `require()`
 * calls for PNGs, which only Metro can resolve, node throws on the first one.
 * Reading the directory tests the same thing the module depends on, and rather
 * more usefully, since it catches a figure that failed to download, came back
 * as a rate-limit page, or got copied from the card next to it.
 */

const DIR = 'assets/cards/court';
const RANKS = ['J', 'Q', 'K'];
const SUITS = ['c', 'd', 'h', 's'];

/** Width, height and colour type straight out of the PNG's IHDR chunk. */
function pngHeader(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes.readUInt8(25),
  };
}

/**
 * Whether the image can be transparent at all.
 *
 * Colour types 4 and 6 carry an alpha channel outright; a palette image (type
 * 3) gets its transparency from a `tRNS` chunk instead, which is how these end
 * up after being quantised, so checking for an alpha channel alone would
 * wrongly reject a perfectly good figure.
 */
function hasTransparency(bytes: Buffer): boolean {
  const type = bytes.readUInt8(25);
  if (type === 4 || type === 6) return true;
  return type === 3 && bytes.includes(Buffer.from('tRNS'));
}

const files = RANKS.flatMap((r) => SUITS.map((s) => `${r}-${s}.png`));

describe('court card artwork', () => {
  it('has one figure for every court card and nothing else', () => {
    const present = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
    expect(present).toEqual([...files].sort());
  });

  it('gives every figure the same size, matching the aspect the layout assumes', () => {
    const sizes = new Set<string>();
    for (const f of files) {
      const bytes = readFileSync(`${DIR}/${f}`);
      const h = pngHeader(bytes);
      sizes.add(`${h.width}x${h.height}`);
      // The figures sit on the card's own paper, so they have to be able to be
      // transparent rather than arriving in a white box.
      expect(hasTransparency(bytes), `${f} cannot be transparent`).toBe(true);
      expect(h.width / h.height, `${f} aspect`).toBeCloseTo(COURT_ASPECT, 4);
    }
    // A jack rendered even slightly larger than the king beside it looks broken.
    expect(sizes.size, `differing sizes: ${[...sizes].join(', ')}`).toBe(1);
  });

  it('gives every court card its own picture', () => {
    // Twelve separate downloads over a rate-limited connection; a duplicate
    // means one of them silently failed and took its neighbour's artwork.
    const seen = new Map<string, string>();
    for (const f of files) {
      const digest = createHash('sha256').update(readFileSync(`${DIR}/${f}`)).digest('hex');
      const clash = seen.get(digest);
      expect(clash, `${f} is byte-identical to ${clash}`).toBeUndefined();
      seen.set(digest, f);
    }
  });

  it('has real artwork in every file, not an empty or truncated one', () => {
    for (const f of files) {
      const bytes = readFileSync(`${DIR}/${f}`);
      expect(bytes.length, `${f} is suspiciously small`).toBeGreaterThan(4000);
      // A well-formed PNG ends with the IEND chunk, a zero length, the type,
      // and its CRC. A download cut short by a rate limit does not.
      expect(bytes.subarray(-12).toString('hex'), `${f} is truncated`).toBe('0000000049454e44ae426082');
    }
  });
});
