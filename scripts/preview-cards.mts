/**
 * Render the whole deck from the app's own card geometry, as one sheet.
 *
 * Judging a card design one screenshot at a time is how the ten ended up with a
 * single giant pip in the middle for so long: each card looked fine in
 * isolation. Drawing all thirteen ranks together, at the sizes the app actually
 * uses, makes a wrong pip row or a colliding index obvious at a glance, and it
 * comes from `cardFace`, the same module the component lays out from, so the
 * sheet cannot flatter a layout the app would not draw.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/preview-cards.mts
 *   qlmanage -t -s 2600 -o docs/design/cards docs/design/cards/deck.svg
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { faceGeometry } from '../src/game/cardFace.ts';
import type { Suit } from '../src/game/cardFace.ts';
import { faceSvg, squareCanvas } from './lib/cardSvg.mts';

const SUITS: Suit[] = ['s', 'h', 'd', 'c'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const HERO = 86;
const BOARD = 46;
const GAP = 14;
const PAD = 28;
const heroG = faceGeometry(HERO);
const boardG = faceGeometry(BOARD);

const sheetW = PAD * 2 + RANKS.length * (HERO + GAP) - GAP;
const heroBlock = SUITS.length * (heroG.h + GAP);
const boardBlock = SUITS.length * (boardG.h + GAP);
const sheetH = PAD * 2 + heroBlock + 40 + boardBlock;

const body: string[] = [`<rect width="${sheetW}" height="${sheetH}" fill="#F5F1E6"/>`];

// The hand you hold: four-index, because you peel it from any corner.
SUITS.forEach((suit, r) => {
  RANKS.forEach((rank, c) => {
    const x = PAD + c * (HERO + GAP);
    const y = PAD + r * (heroG.h + GAP);
    body.push(`<g transform="translate(${x}, ${y})">${faceSvg(rank, suit, HERO, { corners: 4 })}</g>`);
  });
});

const boardTop = PAD + heroBlock + 40;
body.push(
  `<text x="${PAD}" y="${boardTop - 14}" font-size="18" font-family="Helvetica" fill="#555">` +
    `the board at ${BOARD}pt, classic two-index printing, read at a glance rather than peeled</text>`,
);
SUITS.forEach((suit, r) => {
  RANKS.forEach((rank, c) => {
    const x = PAD + c * (HERO + GAP);
    const y = boardTop + r * (boardG.h + GAP);
    body.push(`<g transform="translate(${x}, ${y})">${faceSvg(rank, suit, BOARD)}</g>`);
  });
});

mkdirSync('docs/design/cards', { recursive: true });
writeFileSync('docs/design/cards/deck.svg', squareCanvas(sheetW, sheetH, '#E8E2D4', body.join('')));
console.log(`wrote docs/design/cards/deck.svg (sheet ${sheetW}x${Math.round(sheetH)})`);
