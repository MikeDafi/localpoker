import { describe, expect, it } from 'vitest';
import {
  CARD_RATIO,
  COURT_ASPECT,
  Suit,
  faceGeometry,
  indexScaleX,
  indexWidth,
  isCourt,
  pipLayout,
  pipWidth,
  rankLabel,
} from '../cardFace';
import { SUIT_ASPECT, SUIT_PATH } from '../suitPaths';

const SUITS: Suit[] = ['c', 'd', 'h', 's'];
const NUMBERED = [2, 3, 4, 5, 6, 7, 8, 9, 10, 14];

/** A pip's box in px on a card of the given width. */
function pipBox(size: number, suit: Suit, p: { x: number; y: number; scale: number }) {
  const g = faceGeometry(size);
  const hgt = g.pip.h * p.scale;
  const wid = pipWidth(suit, hgt);
  const cx = p.x * g.w;
  const cy = p.y * g.h;
  return { x0: cx - wid / 2, x1: cx + wid / 2, y0: cy - hgt / 2, y1: cy + hgt / 2 };
}

function overlaps(a: ReturnType<typeof pipBox>, b: ReturnType<typeof pipBox>, slack = 0) {
  return a.x0 < b.x1 - slack && b.x0 < a.x1 - slack && a.y0 < b.y1 - slack && b.y0 < a.y1 - slack;
}

/** A box turned about the card's centre, the way the second index is. */
function mirrorBox(g: { w: number; h: number }, b: ReturnType<typeof pipBox>) {
  return { x0: g.w - b.x1, x1: g.w - b.x0, y0: g.h - b.y1, y1: g.h - b.y0 };
}

describe('card face layout', () => {
  it('prints as many pips as the rank says', () => {
    // The whole reason a real card is readable: you can count it.
    for (const r of NUMBERED) {
      const expected = r === 14 ? 1 : r;
      expect(pipLayout(r), `rank ${r}`).toHaveLength(expected);
    }
  });

  it('draws court cards as a picture rather than a count', () => {
    for (const r of [11, 12, 13]) {
      expect(isCourt(r)).toBe(true);
      expect(pipLayout(r)).toHaveLength(0);
    }
    expect(isCourt(10)).toBe(false);
    expect(isCourt(14)).toBe(false);
  });

  it('prints the bottom half upside down, so the card reads either way up', () => {
    for (const r of NUMBERED) {
      for (const p of pipLayout(r)) {
        expect(p.inverted, `rank ${r} pip at ${p.y}`).toBe(p.y > 0.5);
      }
    }
  });

  it('lays out every rank symmetrically — except the seven, which really is not', () => {
    // Measured off the CC0 reference deck rather than assumed. A seven's odd
    // pip sits between the top and middle rows, in the upper half only, so the
    // card is genuinely not symmetric about its centre. My first version of
    // this test asserted symmetry for every rank and was simply wrong about
    // how a seven is printed.
    for (const r of NUMBERED.filter((n) => n !== 7)) {
      const pips = pipLayout(r);
      for (const p of pips) {
        const mirrored = pips.some(
          (q) => Math.abs(q.y - (1 - p.y)) < 1e-9 && Math.abs(q.x - (1 - p.x)) < 1e-9,
        );
        expect(mirrored, `rank ${r} pip ${p.x},${p.y} has no mirror`).toBe(true);
      }
    }
    const seven = pipLayout(7);
    const odd = seven.filter((p) => !seven.some((q) => Math.abs(q.y - (1 - p.y)) < 1e-9));
    expect(odd).toHaveLength(1);
    expect(odd[0].y).toBeLessThan(0.5);
  });

  it('matches the reference deck pip for pip', () => {
    // Every rank measured from the CC0 English-pattern artwork with
    // scripts/measure-ref-card.py, not recalled. Rows are eighteenths of card
    // height. The seven is the interesting one: its odd pip really does sit in
    // the upper half, making it the only rank that is not symmetric.
    const REFERENCE: Record<number, Array<[number, number]>> = {
      2: [[0.5, 3], [0.5, 15]],
      3: [[0.5, 3], [0.5, 9], [0.5, 15]],
      4: [[0.25, 3], [0.75, 3], [0.25, 15], [0.75, 15]],
      5: [[0.25, 3], [0.75, 3], [0.5, 9], [0.25, 15], [0.75, 15]],
      6: [[0.25, 3], [0.75, 3], [0.25, 9], [0.75, 9], [0.25, 15], [0.75, 15]],
      7: [
        [0.25, 3], [0.75, 3], [0.5, 6], [0.25, 9], [0.75, 9], [0.25, 15], [0.75, 15],
      ],
      8: [
        [0.25, 3], [0.75, 3], [0.5, 6], [0.25, 9], [0.75, 9], [0.5, 12],
        [0.25, 15], [0.75, 15],
      ],
      9: [
        [0.25, 3], [0.75, 3], [0.25, 7], [0.75, 7], [0.5, 9],
        [0.25, 11], [0.75, 11], [0.25, 15], [0.75, 15],
      ],
      10: [
        [0.25, 3], [0.75, 3], [0.5, 5], [0.25, 7], [0.75, 7],
        [0.25, 11], [0.75, 11], [0.5, 13], [0.25, 15], [0.75, 15],
      ],
    };
    for (const [rank, cells] of Object.entries(REFERENCE)) {
      const got = pipLayout(Number(rank))
        .map((p) => `${p.x.toFixed(3)}@${Math.round(p.y * 18)}`)
        .sort();
      const want = cells.map(([x, row]) => `${x.toFixed(3)}@${row}`).sort();
      expect(got, `rank ${rank}`).toEqual(want);
    }
  });

  it('never overlaps two pips', () => {
    for (const size of [40, 56, 86]) {
      for (const suit of SUITS) {
        for (const r of NUMBERED) {
          const boxes = pipLayout(r).map((p) => pipBox(size, suit, p));
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              expect(overlaps(boxes[i], boxes[j], 0.01), `${r}${suit} @${size}: pips ${i}/${j}`).toBe(
                false,
              );
            }
          }
        }
      }
    }
  });

  it('keeps every pip on the card', () => {
    for (const size of [40, 56, 86]) {
      const g = faceGeometry(size);
      for (const suit of SUITS) {
        for (const r of NUMBERED) {
          for (const p of pipLayout(r)) {
            const b = pipBox(size, suit, p);
            expect(b.x0, `${r}${suit} @${size}`).toBeGreaterThanOrEqual(0);
            expect(b.x1, `${r}${suit} @${size}`).toBeLessThanOrEqual(g.w);
            expect(b.y0, `${r}${suit} @${size}`).toBeGreaterThanOrEqual(0);
            expect(b.y1, `${r}${suit} @${size}`).toBeLessThanOrEqual(g.h);
          }
        }
      }
    }
  });

  it('keeps both index columns clear of the pips', () => {
    // The index and the top row of pips sit at the same height on a real card;
    // what keeps them apart is that the index column ends before the pip column
    // begins. Demanding a real gap rather than mere non-overlap, because an
    // index that exactly touches the pips passes an overlap check and still
    // looks like a printing error — this is what forces a ten's digits to be
    // condensed.
    //
    // Both columns are checked explicitly rather than argued from symmetry,
    // because your own cards are printed four-index — you peel them from
    // whichever corner your thumb reaches, and a two-index card shows nothing
    // but pips from half of them.
    for (const size of [40, 56, 86]) {
      const g = faceGeometry(size);
      for (const suit of SUITS) {
        for (const r of [...NUMBERED, 11, 12, 13]) {
          const half = Math.max(indexWidth(rankLabel(r), g), pipWidth(suit, g.index.suitH)) / 2;
          for (const p of pipLayout(r)) {
            for (const b of [pipBox(size, suit, p), mirrorBox(g, pipBox(size, suit, p))]) {
              if (b.y0 >= g.index.suitY + g.index.suitH / 2) continue;
              // Left-hand index column.
              expect(b.x0 - (g.index.x + half), `${r}${suit} @${size} crowds the left index`).toBeGreaterThan(
                size * 0.01,
              );
              // Right-hand index column, which only a four-index card prints.
              expect(
                g.w - g.index.x - half - b.x1,
                `${r}${suit} @${size} crowds the right index`,
              ).toBeGreaterThan(size * 0.01);
            }
          }
        }
      }
    }
  });

  it('condenses only the ranks that would otherwise overrun their column', () => {
    const g = faceGeometry(56);
    for (const r of [2, 9, 11, 12, 13, 14]) {
      // Single characters are drawn essentially unsqueezed.
      expect(indexScaleX(rankLabel(r), g), `rank ${r}`).toBeGreaterThan(0.94);
    }
    // A ten is two characters in a space meant for one, and is squeezed hard —
    // but still drawn wider, relative to its height, than the reference deck's
    // own ten, which is narrower again.
    expect(indexScaleX('10', g)).toBeLessThan(0.7);
    expect(indexWidth('10', g) / g.index.rankCap).toBeGreaterThan(0.7);
  });

  it('never lets an index escape its column', () => {
    for (const size of [40, 56, 86]) {
      const g = faceGeometry(size);
      for (let r = 2; r <= 14; r++) {
        expect(indexWidth(rankLabel(r), g), `rank ${r} @${size}`).toBeLessThanOrEqual(
          g.indexRoom + 1e-9,
        );
      }
      // And the column itself stops short of the pips.
      expect(g.index.x + g.indexRoom / 2).toBeLessThan(0.25 * size - g.pip.w / 2);
    }
  });

  it('scales every measurement with the card', () => {
    const a = faceGeometry(40);
    const b = faceGeometry(80);
    expect(b.w / a.w).toBeCloseTo(2, 9);
    expect(b.h / a.h).toBeCloseTo(2, 9);
    expect(b.pip.h / a.pip.h).toBeCloseTo(2, 9);
    expect(b.index.rankFont / a.index.rankFont).toBeCloseTo(2, 9);
    expect(a.h).toBeCloseTo(40 * CARD_RATIO, 9);
  });

  it('centres the index digits on their stated position', () => {
    const g = faceGeometry(56);
    // Baseline sits half a cap height below the centre, which is what puts the
    // digits' middle exactly on `y`.
    expect(g.index.rankBaseline - g.index.y).toBeCloseTo(g.index.rankCap / 2, 9);
  });

  it('keeps the court figure on the card and clear of the index', () => {
    // The figure is fitted into its box with `meet`, so what actually gets
    // drawn is the box narrowed to the artwork's own aspect and centred. That
    // fitted width is what has to clear the corner index, not the box.
    for (const size of [40, 56, 86]) {
      const g = faceGeometry(size);
      const drawnW = Math.min(g.court.art.w, g.court.art.h * COURT_ASPECT);
      const x0 = g.court.art.x + (g.court.art.w - drawnW) / 2;
      expect(x0, `@${size}`).toBeGreaterThan(0);
      expect(x0 + drawnW, `@${size}`).toBeLessThan(g.w);
      expect(g.court.art.y, `@${size}`).toBeGreaterThan(0);
      expect(g.court.art.y + g.court.art.h, `@${size}`).toBeLessThanOrEqual(g.h);
      // Height is what binds on this card's proportions, so the figure is
      // narrower than its box rather than stretched to fill it.
      expect(drawnW).toBeLessThan(g.court.art.w);
    }
  });

  it('has a real outline and a true aspect for every suit', () => {
    for (const s of SUITS) {
      expect(SUIT_PATH[s].length, s).toBeGreaterThan(40);
      expect(SUIT_PATH[s], s).toMatch(/^M /);
      // Card pips are taller than they are wide; a square one means the
      // extraction lost the aspect.
      expect(SUIT_ASPECT[s], s).toBeGreaterThan(0.5);
      expect(SUIT_ASPECT[s], s).toBeLessThan(0.85);
      expect(pipWidth(s, 30)).toBeCloseTo(30 * SUIT_ASPECT[s], 9);
    }
  });
});
