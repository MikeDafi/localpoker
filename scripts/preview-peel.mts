/**
 * Render the peel at every grab position and depth, as one sheet.
 *
 * The fold is the one part of this app you cannot judge from a screenshot: it
 * is a continuum, and any single frame of it looks plausible. Laying the whole
 * range out at once is how the previous version's real faults were found — a
 * value drawn at low opacity *outside* a flap too small to hold it, and a fold
 * deep enough to take half the card with it.
 *
 * It draws from `peelFold`, the same unit-tested module the component animates,
 * and folds the same card face `cardFace` lays out, so the sheet cannot flatter
 * geometry the app would not produce. What it cannot check is whether
 * react-native-svg actually animates these props on device; only a device can
 * answer that.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/preview-peel.mts
 *   qlmanage -t -s 2400 -o docs/design/peel docs/design/peel/peel-range.svg
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  circlePoly,
  clipToFlat,
  creaseFor,
  creaseSegment,
  foldExtent,
  foldLimit,
  foldOrigin,
  foldParts,
  foldShadow,
  pathFromPoly,
  reflectMatrix,
  PEEL_FRACTION,
  type Pt,
} from '../src/game/peelFold.ts';
import { faceSvg, squareCanvas } from './lib/cardSvg.mts';

const SIZE = 86;
const H = SIZE * 1.42;
const RANK = 9;
const SUIT = 'h' as const;

/**
 * Every grab the gesture can actually produce.
 *
 * Only the bottom half: a fold may not start above the card's midline, because
 * that is how a hand is held. The top corners are deliberately absent — if they
 * ever appear here again, the limit has been lost.
 */
const GRABS: Array<{ name: string; anchor: Pt; dir: [number, number] }> = [
  { name: 'bottom-left corner', anchor: { x: 0, y: H }, dir: [Math.SQRT1_2, -Math.SQRT1_2] },
  { name: 'bottom-right corner', anchor: { x: SIZE, y: H }, dir: [-Math.SQRT1_2, -Math.SQRT1_2] },
  { name: 'bottom edge, straight up', anchor: { x: SIZE / 2, y: H }, dir: [0, -1] },
  { name: 'bottom edge, dragged askew', anchor: { x: SIZE * 0.4, y: H }, dir: [0.5, -0.866] },
  { name: 'left side, at the midline', anchor: { x: 0, y: H * 0.5 }, dir: [1, 0] },
  { name: 'right side, at the midline', anchor: { x: SIZE, y: H * 0.5 }, dir: [-1, 0] },
  { name: 'right side, low, pulled up', anchor: { x: SIZE, y: H * 0.8 }, dir: [-0.6, -0.8] },
];

const STEPS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

let clipSeq = 0;

function peelAt(anchor: Pt, dir: [number, number], t: number): string {
  // Matches HoleCards: the peel may neither fold the card in half nor uncover
  // anything above the midline.
  // Matches HoleCards: the crease enters at the card's far edge, never folds
  // the card in half, and never uncovers anything above the midline.
  const origin = foldOrigin(SIZE, H, dir[0], dir[1]);
  const reach = Math.min(
    foldExtent(SIZE, H, origin, dir[0], dir[1]) * PEEL_FRACTION,
    foldLimit(SIZE, H, origin, dir[0], dir[1], H * 0.5),
  );
  const c = creaseFor(origin, dir[0], dir[1], reach * t);
  const { flat, flap } = foldParts(SIZE, H, c);
  const seg = creaseSegment(SIZE, H, c);
  const clipId = `flap${clipSeq++}`;
  const parts: string[] = [];

  parts.push(
    `<defs><clipPath id="${clipId}"><path d="${pathFromPoly(flap)}"/></clipPath></defs>`,
    `<path d="${pathFromPoly(flat)}" fill="#22384A" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>`,
    `<path d="${pathFromPoly(clipToFlat(circlePoly(SIZE / 2, H / 2, SIZE * 0.23), c))}" ` +
      `fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>`,
  );
  for (const band of [0.3, 0.18, 0.08]) {
    parts.push(`<path d="${pathFromPoly(foldShadow(SIZE, H, c, SIZE * band))}" fill="#000" fill-opacity="0.1"/>`);
  }
  parts.push(`<path d="${pathFromPoly(flap)}" fill="#F4F7FA"/>`);
  // The line the peel must never uncover past.
  parts.push(
    `<line x1="0" y1="${(H / 2).toFixed(2)}" x2="${SIZE}" y2="${(H / 2).toFixed(2)}" ` +
      `stroke="#2BA84A" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.65"/>`,
  );
  // The card's own face, folded over the bend and trimmed to the lifted paper.
  parts.push(
    `<g clip-path="url(#${clipId})"><g transform="matrix(${reflectMatrix(c)})">` +
      faceSvg(RANK, SUIT, SIZE, { paper: false, corners: 4 }) +
      `</g></g>`,
  );
  if (seg) {
    parts.push(
      `<line x1="${seg[0].x.toFixed(2)}" y1="${seg[0].y.toFixed(2)}" x2="${seg[1].x.toFixed(2)}" ` +
        `y2="${seg[1].y.toFixed(2)}" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round"/>`,
    );
  }
  return parts.join('');
}

const COL_W = SIZE + 26;
const ROW_H = H + 44;
const PAD = 30;
const LABEL_W = 250;
const sheetW = PAD * 2 + LABEL_W + STEPS.length * COL_W;
const sheetH = PAD * 2 + 36 + GRABS.length * ROW_H;

const body: string[] = [`<rect width="${sheetW}" height="${sheetH}" fill="#14191F"/>`];
STEPS.forEach((t, c) => {
  body.push(
    `<text x="${PAD + LABEL_W + c * COL_W + SIZE / 2}" y="${PAD + 22}" font-size="15" ` +
      `font-family="Helvetica" fill="#8A97A4" text-anchor="middle">${Math.round(t * 100)}%</text>`,
  );
});
GRABS.forEach((g, r) => {
  const y = PAD + 36 + r * ROW_H;
  body.push(
    `<text x="${PAD}" y="${y + H / 2}" font-size="15" font-family="Helvetica" fill="#C7D2DC">${g.name}</text>`,
  );
  STEPS.forEach((t, c) => {
    const x = PAD + LABEL_W + c * COL_W;
    body.push(`<g transform="translate(${x}, ${y})">${peelAt(g.anchor, g.dir, t)}</g>`);
  });
});

mkdirSync('docs/design/peel', { recursive: true });
writeFileSync('docs/design/peel/peel-range.svg', squareCanvas(sheetW, sheetH, '#0A0E12', body.join('')));
console.log(`wrote docs/design/peel/peel-range.svg (sheet ${sheetW}x${Math.round(sheetH)})`);
