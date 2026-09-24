/**
 * The card face as an SVG string, for the design preview sheets.
 *
 * A second implementation of the face is a real risk, so it is written once
 * here and used by every preview, and it takes all of its geometry from
 * `cardFace`, the module the app itself lays out from. Only the emission is
 * duplicated; every position, size and pip arrangement comes from the app.
 */
import { readFileSync } from 'node:fs';
import {
  SUIT_PATH,
  COURT_ASPECT,
  type Suit,
  faceGeometry,
  indexScaleX,
  isCourt,
  pipLayout,
  pipTransform,
  rankLabel,
} from '../../src/game/cardFace.ts';

export const RED = '#C8362C';
export const BLACK = '#1E2830';

export interface FaceOptions {
  /** Draw the white card stock. The fold leaves it off; it has its own paper. */
  paper?: boolean;
  /** Four-index printing, as the peelable cards use. */
  corners?: 2 | 4;
}

function turn(flip: boolean, g: ReturnType<typeof faceGeometry>): string {
  return flip ? ` transform="rotate(180, ${g.w / 2}, ${g.h / 2})"` : '';
}

const courtCache = new Map<string, string>();

/**
 * The court figure, inlined as a data URI.
 *
 * `qlmanage` will not follow a relative `href` out of the SVG it is rendering,
 * so a sheet that merely pointed at the PNGs would show twelve empty boxes and
 * quietly suggest the artwork was broken.
 */
function courtImage(rank: number, suit: Suit, g: ReturnType<typeof faceGeometry>): string {
  const name = `${{ 11: 'J', 12: 'Q', 13: 'K' }[rank]}-${suit}`;
  let uri = courtCache.get(name);
  if (!uri) {
    uri = `data:image/png;base64,${readFileSync(`assets/cards/court/${name}.png`).toString('base64')}`;
    courtCache.set(name, uri);
  }
  const a = g.court.art;
  // Matches the component: fitted inside the box, never stretched to fill it.
  const drawnW = Math.min(a.w, a.h * COURT_ASPECT);
  const x = a.x + (a.w - drawnW) / 2;
  return (
    `<image href="${uri}" x="${x.toFixed(2)}" y="${a.y.toFixed(2)}" ` +
    `width="${drawnW.toFixed(2)}" height="${a.h.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`
  );
}

export function faceSvg(rank: number, suit: Suit, size: number, opts: FaceOptions = {}): string {
  const { paper = true, corners = 2 } = opts;
  const g = faceGeometry(size);
  const ink = suit === 'h' || suit === 'd' ? RED : BLACK;
  const label = rankLabel(rank);
  const squeeze = indexScaleX(label, g);
  const out: string[] = [];

  if (paper) {
    out.push(
      `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${(g.w * 0.085).toFixed(2)}" ` +
        `fill="#FFFFFF" stroke="#E2E8EE" stroke-width="1"/>`,
    );
  }

  if (isCourt(rank)) {
    out.push(courtImage(rank, suit, g));
  } else {
    for (const p of pipLayout(rank)) {
      out.push(
        `<path d="${SUIT_PATH[suit]}" fill="${ink}" ` +
          `transform="${pipTransform(p.x * g.w, p.y * g.h, g.pip.h * p.scale, p.inverted)}"/>`,
      );
    }
  }

  const xs = corners === 4 ? [g.index.x, g.w - g.index.x] : [g.index.x];
  for (const flip of [false, true]) {
    const marks = xs
      .map(
        (x) =>
          `<g transform="translate(${x.toFixed(2)}, ${g.index.rankBaseline.toFixed(2)}) scale(${squeeze.toFixed(4)}, 1)">` +
          `<text x="0" y="0" font-size="${g.index.rankFont.toFixed(2)}" font-weight="700" ` +
          `font-family="Helvetica" fill="${ink}" text-anchor="middle">${label}</text></g>` +
          `<path d="${SUIT_PATH[suit]}" fill="${ink}" transform="${pipTransform(x, g.index.suitY, g.index.suitH, false)}"/>`,
      )
      .join('');
    out.push(`<g${turn(flip, g)}>${marks}</g>`);
  }
  return out.join('');
}

/**
 * Pad a sheet out to a square before writing it.
 *
 * `qlmanage`, the only rasteriser available here, ignores `viewBox` and renders
 * everything into a square, so a wide sheet comes out vertically stretched and
 * every judgement made from it about proportion is wrong.
 */
export function squareCanvas(w: number, h: number, bg: string, content: string): string {
  const s = Math.max(w, h);
  const dx = (s - w) / 2;
  const dy = (s - h) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<rect width="${s}" height="${s}" fill="${bg}"/>` +
    `<g transform="translate(${dx.toFixed(2)}, ${dy.toFixed(2)})">${content}</g>` +
    `</svg>`
  );
}
