import { describe, expect, it } from 'vitest';
import {
  Crease,
  Poly,
  Pt,
  cardUnder,
  centroid,
  circlePoly,
  clearanceAt,
  clipToCard,
  clipToFlat,
  creaseFor,
  creaseSegment,
  fitInside,
  foldAmount,
  foldExtent,
  foldLimit,
  foldOrigin,
  foldParts,
  foldShadow,
  grabAnchor,
  pathFromPoly,
  PEEL_FRACTION,
  PEEL_OVERSHOOT,
  reflectAcross,
  reflectMatrix,
  roundRectPoly,
  sideOf,
} from '../peelFold';

const W = 76;
const H = 108;

/** Shoelace area; polygons here are convex and consistently wound. */
function area(poly: Poly): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function unit(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  return [x / m, y / m];
}

/** Drop vertices that repeat, so shape claims are not hostage to float noise. */
function distinct(poly: Poly): Poly {
  const out: Poly = [];
  for (const p of poly) {
    if (!out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)) out.push(p);
  }
  return out;
}

const CORNERS: Record<string, Pt> = {
  tl: { x: 0, y: 0 },
  tr: { x: W, y: 0 },
  bl: { x: 0, y: H },
  br: { x: W, y: H },
};

/** The inward diagonal from a corner, which is how a dog-ear is folded. */
function diagonalFrom(corner: Pt): [number, number] {
  return unit(corner.x === 0 ? 1 : -1, corner.y === 0 ? 1 : -1);
}

/** Every way you might start a peel: four corners and four edge midpoints. */
const GRABS: { name: string; anchor: Pt; dir: [number, number] }[] = [
  ...Object.entries(CORNERS).map(([name, anchor]) => ({
    name: `${name} corner`,
    anchor,
    dir: diagonalFrom(anchor),
  })),
  { name: 'bottom edge', anchor: { x: W / 2, y: H }, dir: [0, -1] as [number, number] },
  { name: 'top edge', anchor: { x: W / 2, y: 0 }, dir: [0, 1] as [number, number] },
  { name: 'left edge', anchor: { x: 0, y: H / 2 }, dir: [1, 0] as [number, number] },
  { name: 'right edge', anchor: { x: W, y: H / 2 }, dir: [-1, 0] as [number, number] },
];

describe('peel fold geometry', () => {
  it('refuses to fold on a value that is not a number', () => {
    // Defence in depth: a NaN reaching the geometry becomes `matrix(NaN,...)`
    // and a stream of errors from inside the rendering libraries, naming
    // neither the card nor the gesture that produced it.
    const nan = creaseFor({ x: 0, y: H }, Math.SQRT1_2, -Math.SQRT1_2, NaN);
    expect(foldParts(W, H, nan).flap).toHaveLength(0);
    expect(area(foldParts(W, H, nan).flat)).toBeCloseTo(W * H, 4);
    expect(reflectMatrix(nan, true, W)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(creaseSegment(W, H, nan)).toBeNull();
  });

  it('treats a collapsed fold direction as no fold at all', () => {
    // A direction of zero length is what a gesture reports the instant a finger
    // lands, before it has moved. Without a guard every point of the card tests
    // as being exactly on the crease, so the card comes out both flat *and*
    // fully folded; the flap is a perfect copy of the whole card drawn over
    // the top of it, which on device is a blank white rectangle where the card
    // should be.
    const dead = creaseFor({ x: 0, y: H }, 0, 0, 40);
    const { flat, flap } = foldParts(W, H, dead);
    expect(area(flat)).toBeCloseTo(W * H, 4);
    expect(flap).toHaveLength(0);
    expect(creaseSegment(W, H, dead)).toBeNull();
    expect(foldShadow(W, H, dead, 10)).toHaveLength(0);
    // Decoration is left whole rather than cut by a crease that is not there.
    const ring = circlePoly(W / 2, H / 2, 10);
    expect(clipToFlat(ring, dead)).toHaveLength(ring.length);
  });

  it('leaves the card whole when nothing has been lifted', () => {
    for (const g of GRABS) {
      const c = creaseFor(g.anchor, g.dir[0], g.dir[1], 0);
      const { flat, flap } = foldParts(W, H, c);
      expect(area(flat)).toBeCloseTo(W * H, 4);
      expect(area(flap)).toBeCloseTo(0, 4);
    }
  });

  it('peels from edges as readily as from corners', () => {
    // The point of deriving the crease from the drag: a grab anywhere on the
    // boundary lifts a real piece of card, not just the four dog-ears.
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * 0.5);
      const { flat, flap } = foldParts(W, H, c);
      expect(area(flap), g.name).toBeGreaterThan(W * H * 0.02);
      expect(area(flat), g.name).toBeLessThan(W * H);
    }
  });

  it('folds a straight edge into a strip and a corner into a triangle', () => {
    // Different shapes falling out of the same formula is the whole claim.
    // Counted after deduping, because clipping a vertex that lands exactly on
    // the card's border can emit it twice; that is noise in the representation,
    // not a fifth corner.
    const edge = creaseFor({ x: W / 2, y: H }, 0, -1, H * 0.5);
    expect(distinct(foldParts(W, H, edge).flap)).toHaveLength(4);

    const corner = CORNERS.bl;
    const [dx, dy] = diagonalFrom(corner);
    const dog = creaseFor(corner, dx, dy, W * 0.6);
    expect(distinct(foldParts(W, H, dog).flap)).toHaveLength(3);
  });

  it('conserves area: what stops lying flat is exactly what got peeled', () => {
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      for (const t of [0.15, 0.4, 0.7]) {
        const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * t);
        const { flat, flap } = foldParts(W, H, c);
        expect(area(flat) + area(flap), `${g.name} @${t}`).toBeCloseTo(W * H, 3);
      }
    }
  });

  it('uncovers more of the card the further you peel', () => {
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      let last = W * H + 1;
      for (const t of [0, 0.2, 0.4, 0.6, 0.8]) {
        const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * t);
        const flat = area(foldParts(W, H, c).flat);
        expect(flat, `${g.name} @${t}`).toBeLessThanOrEqual(last + 1e-6);
        last = flat;
      }
    }
  });

  it('folds rather than slides: the flap is congruent to the hole it leaves', () => {
    // A hinge would swing the whole card about a point and the lifted piece
    // would be the size of the card. A fold only ever lifts what it uncovers.
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * 0.45);
      const { flat, flap } = foldParts(W, H, c);
      expect(area(flap), g.name).toBeCloseTo(W * H - area(flat), 3);
    }
  });

  it('lands the pinned point exactly under the finger', () => {
    // Fold a sheet by dragging one point and that point ends up where you
    // dragged it. If this drifts, the card is sliding, not folding.
    for (const g of GRABS) {
      const dist = 30;
      const c = creaseFor(g.anchor, g.dir[0], g.dir[1], dist);
      const landed = reflectAcross(g.anchor, c);
      expect(landed.x, g.name).toBeCloseTo(g.anchor.x + g.dir[0] * dist, 6);
      expect(landed.y, g.name).toBeCloseTo(g.anchor.y + g.dir[1] * dist, 6);
    }
  });

  it('keeps the flap pinned to the crease at both ends', () => {
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * 0.4);
      const seg = creaseSegment(W, H, c);
      expect(seg, g.name).not.toBeNull();
      const { flap } = foldParts(W, H, c);
      for (const end of seg as [Pt, Pt]) {
        const near = Math.min(...flap.map((p) => Math.hypot(p.x - end.x, p.y - end.y)));
        expect(near, `${g.name} end ${end.x},${end.y}`).toBeLessThan(0.01);
      }
    }
  });

  it('never lets the flap spill off the card', () => {
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * t);
        for (const p of foldParts(W, H, c).flap) {
          expect(p.x).toBeGreaterThanOrEqual(-0.01);
          expect(p.x).toBeLessThanOrEqual(W + 0.01);
          expect(p.y).toBeGreaterThanOrEqual(-0.01);
          expect(p.y).toBeLessThanOrEqual(H + 0.01);
        }
      }
    }
  });

  it('does not move a point that is already on the crease', () => {
    const c = creaseFor({ x: 0, y: H }, ...unit(1, -1), 40);
    const seg = creaseSegment(W, H, c) as [Pt, Pt];
    for (const p of seg) {
      const r = reflectAcross(p, c);
      expect(r.x).toBeCloseTo(p.x, 6);
      expect(r.y).toBeCloseTo(p.y, 6);
    }
  });

  it('reflects symmetrically: folding twice returns you to the start', () => {
    const c: Crease = creaseFor({ x: W, y: H }, ...unit(-2, -1), 33);
    const p = { x: 12, y: 91 };
    const back = reflectAcross(reflectAcross(p, c), c);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('turns the drag into a crease square to it, halfway along', () => {
    const anchor = { x: 0, y: H };
    const [dx, dy] = unit(3, -4);
    const c = creaseFor(anchor, dx, dy, 50);
    const mid = { x: anchor.x + dx * 25, y: anchor.y + dy * 25 };
    expect(sideOf(mid, c)).toBeCloseTo(0, 6);
    // Square to the drag means the drag direction is the crease's normal.
    expect(c.nx).toBeCloseTo(dx, 6);
    expect(c.ny).toBeCloseTo(dy, 6);
  });
});

describe('grabbing the card', () => {
  it('snaps a touch near a corner to that corner', () => {
    expect(grabAnchor(W, H, { x: 6, y: 9 }, 16)).toEqual({ x: 0, y: 0 });
    expect(grabAnchor(W, H, { x: W - 4, y: H - 3 }, 16)).toEqual({ x: W, y: H });
  });

  it('slides a touch away from the corners onto the nearest edge', () => {
    // Mid-height near the left edge: the left edge, at the finger's height.
    expect(grabAnchor(W, H, { x: 5, y: H / 2 }, 16)).toEqual({ x: 0, y: H / 2 });
    // Mid-width near the bottom: the bottom edge, at the finger's width.
    expect(grabAnchor(W, H, { x: W / 2, y: H - 5 }, 16)).toEqual({ x: W / 2, y: H });
  });

  it('always lands on the card boundary, wherever you touch', () => {
    // A fold has to start at an edge; a grab in the middle of the card still
    // has to resolve to somewhere it could physically begin.
    for (let x = 0; x <= W; x += 4) {
      for (let y = 0; y <= H; y += 4) {
        const a = grabAnchor(W, H, { x, y }, 14);
        const onEdge = a.x === 0 || a.x === W || a.y === 0 || a.y === H;
        expect(onEdge, `${x},${y} -> ${a.x},${a.y}`).toBe(true);
      }
    }
  });

  it('only ever starts a fold in the half of the card it is told to', () => {
    // Hole cards are held at the near edge and lifted towards you, so the top
    // half is not somewhere a peel should be able to begin.
    const minY = H / 2;
    for (let x = 0; x <= W; x += 3) {
      for (let y = 0; y <= H; y += 3) {
        const a = grabAnchor(W, H, { x, y }, 14, minY);
        expect(a.y, `${x},${y} -> ${a.x},${a.y}`).toBeGreaterThanOrEqual(minY);
        // Still on a real edge of the card, `minY` is a limit, not a new edge
        // to fold from.
        const onEdge = a.x === 0 || a.x === W || a.y === H;
        expect(onEdge, `${x},${y} -> ${a.x},${a.y}`).toBe(true);
      }
    }
  });

  it('snaps only to the bottom corners when the top is out of bounds', () => {
    expect(grabAnchor(W, H, { x: W - 4, y: H - 3 }, 16, H / 2)).toEqual({ x: W, y: H });
    expect(grabAnchor(W, H, { x: 4, y: H - 2 }, 16, H / 2)).toEqual({ x: 0, y: H });
    // Reaching for a top corner does not get you one: the grab lands at the
    // nearest place a fold may actually begin, which is that side, as high up
    // as the limit allows.
    expect(grabAnchor(W, H, { x: 4, y: 3 }, 16, H / 2)).toEqual({ x: 0, y: H / 2 });
  });

  it('never turns a drag into a fold of nothing', () => {
    // Dragging away from the card leaves no room to fold into, and the obvious
    // arithmetic divides zero by zero. The `NaN` that produced travelled into
    // the fold's transform and the card's lift, where it surfaced as a stream
    // of errors from inside the rendering libraries, during hand-peeling only,
    // which is why no scripted animation ever caught it.
    const inputs = [-5, 0, 0.0001, 3, 40, 1e6];
    for (const dist of inputs) {
      for (const reach of [-1, 0, 0.0001, 60]) {
        for (const dead of [0, 7]) {
          const v = foldAmount(dist, reach, dead);
          expect(Number.isFinite(v), `dist=${dist} reach=${reach} dead=${dead} -> ${v}`).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          if (reach > 0) expect(v).toBeLessThanOrEqual(reach * 1.12 + 1e-9);
        }
      }
    }
  });

  it('holds the card shut until the drag clears the dead zone', () => {
    expect(foldAmount(5, 60, 7)).toBe(0);
    expect(foldAmount(7, 60, 7)).toBe(0);
    expect(foldAmount(20, 60, 7)).toBeCloseTo(13, 6);
  });

  it('resists rather than stopping dead past the end of the range', () => {
    const reach = 60;
    const atMax = foldAmount(67, reach, 7);
    const wayPast = foldAmount(400, reach, 7);
    expect(atMax).toBeCloseTo(reach, 6);
    expect(wayPast).toBeGreaterThan(reach);
    expect(wayPast).toBeLessThan(reach * 1.13);
  });

  it('measures how far there is to fold in the direction you are pulling', () => {
    // Straight up from the bottom edge: the card's height.
    expect(foldExtent(W, H, { x: W / 2, y: H }, 0, -1)).toBeCloseTo(H, 6);
    // Across from the left edge: the card's width.
    expect(foldExtent(W, H, { x: 0, y: H / 2 }, 1, 0)).toBeCloseTo(W, 6);
    // Dragging a corner at 45° is *not* the diagonal's length, which was my
    // first guess and is wrong: it is how far the far corner projects onto the
    // 45° axis, `(w + h) / √2`. The diagonal is only the answer when you pull
    // along the diagonal itself.
    expect(foldExtent(W, H, { x: 0, y: H }, ...unit(1, -1))).toBeCloseTo((W + H) / Math.SQRT2, 6);
    expect(foldExtent(W, H, { x: 0, y: H }, ...unit(W, -H))).toBeCloseTo(Math.hypot(W, H), 6);
  });
});

describe('dragging across a row of cards', () => {
  const GAP = 10;
  const PITCH = W + GAP;
  const COUNT = 2;

  it('puts every point of the row on a card, including the gap between them', () => {
    for (let x = -40; x <= PITCH * COUNT + 40; x += 1) {
      const i = cardUnder(x, PITCH, COUNT);
      expect(Number.isInteger(i), `x=${x} -> ${i}`).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(COUNT);
    }
    // The gap belongs to the card on its left, so a grab there still lands on
    // the card you were plainly reaching for.
    expect(cardUnder(W + 2, PITCH, COUNT)).toBe(0);
    expect(cardUnder(PITCH, PITCH, COUNT)).toBe(1);
  });

  it('survives a degenerate row rather than dividing by zero', () => {
    expect(cardUnder(50, 0, 2)).toBe(0);
    expect(cardUnder(50, PITCH, 0)).toBe(0);
  });

  it('does not jump when the finger crosses between the cards', () => {
    // The glitch: re-deciding which card the finger is over on every frame
    // leaves the pinned point on the card that was grabbed while the finger
    // starts being measured from its neighbour, so the fold lurches by a whole
    // card's pitch the moment the gap is crossed.
    const keep = H * 0.5;
    const grabbedAt = 20;
    const held = cardUnder(grabbedAt, PITCH, COUNT);
    const anchor = grabAnchor(W, H, { x: grabbedAt, y: H - 6 }, W * 0.34, keep);
    let dirX = Math.SQRT1_2;
    let dirY = -Math.SQRT1_2;
    let previous: number | null = null;

    for (let x = grabbedAt; x <= PITCH + W; x += 2) {
      const local = { x: x - held * PITCH, y: H - 40 };
      const vx = local.x - anchor.x;
      const vy = local.y - anchor.y;
      const dist = Math.hypot(vx, vy);
      if (dist > 0.001) {
        dirX = vx / dist;
        dirY = vy / dist;
      }
      const reach = Math.min(
        foldExtent(W, H, anchor, dirX, dirY) * PEEL_FRACTION,
        foldLimit(W, H, anchor, dirX, dirY, keep),
      );
      const fold = foldAmount(dist, reach, W * 0.08);
      if (previous !== null) {
        // Two points of finger travel must not move the fold more than a few
        // points. Re-deciding the card mid-drag moved it by about eighteen.
        expect(Math.abs(fold - previous), `lurched at x=${x}`).toBeLessThan(5);
      }
      previous = fold;
    }
  });
});

describe('keeping the peel in the bottom half', () => {
  const KEEP = H / 2;

  /** Every way the gesture can grab, now that the top half is out of bounds. */
  const LEGAL: { name: string; anchor: Pt; dir: [number, number] }[] = [
    { name: 'bottom-left corner', anchor: { x: 0, y: H }, dir: unit(1, -1) },
    { name: 'bottom-right corner', anchor: { x: W, y: H }, dir: unit(-1, -1) },
    { name: 'bottom edge, up', anchor: { x: W / 2, y: H }, dir: [0, -1] },
    { name: 'bottom edge, askew', anchor: { x: W * 0.4, y: H }, dir: unit(1, -2) },
    { name: 'left side, at the midline', anchor: { x: 0, y: KEEP }, dir: [1, 0] },
    { name: 'right side, at the midline', anchor: { x: W, y: KEEP }, dir: [-1, 0] },
    { name: 'right side, low, pulled up', anchor: { x: W, y: H * 0.8 }, dir: unit(-3, -4) },
    { name: 'left side, low, pulled across', anchor: { x: 0, y: H * 0.75 }, dir: unit(4, -1) },
  ];

  it('never uncovers a single point above the midline', () => {
    // The claim in one test. Limiting where a peel may *begin* does not limit
    // what it exposes: a grab on the side at the midline starts legally and
    // still folds the card across its full height, laying the whole face open.
    //
    // What a peel exposes is the region it lifts off the table, not the flap,
    // which is paper landing on top of the card and may legitimately cover the
    // half it came from. A point is uncovered exactly when it falls on the
    // peeled side of the crease.
    for (const g of LEGAL) {
      const cap = Math.min(
        foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]) * PEEL_FRACTION,
        foldLimit(W, H, g.anchor, g.dir[0], g.dir[1], KEEP),
      );
      // Driven through the gesture's own arithmetic, dragged far past the end,
      // so the rubber band is included: it used to be worth a further twelve
      // per cent on top of the cap, which carried the crease over the midline.
      const soft = cap / PEEL_OVERSHOOT;
      for (let t = 0; t <= 4; t += 0.1) {
        const c = creaseFor(g.anchor, g.dir[0], g.dir[1], foldAmount(cap * t, soft, 0));
        // Sampled over the whole protected half, not just its corners, so this
        // cannot pass by agreeing with the limit's own reasoning.
        for (let x = 0; x <= W; x += 4) {
          for (let y = 0; y <= KEEP; y += 4) {
            expect(
              sideOf({ x, y }, c),
              `${g.name} @${t.toFixed(2)} uncovered ${x},${y}`,
            ).toBeGreaterThanOrEqual(-1e-9);
          }
        }
      }
    }
  });

  it('pins a sideways pull at the midline to nothing, because it could only expose everything', () => {
    // The exact case from the bug: grab the right edge halfway up, drag left,
    // and the crease is vertical and full height, so any fold at all uncovers
    // the top of the card.
    expect(foldLimit(W, H, { x: W, y: KEEP }, -1, 0, KEEP)).toBe(0);
    expect(foldLimit(W, H, { x: 0, y: KEEP }, 1, 0, KEEP)).toBe(0);
  });

  it('still leaves a corner enough room to read', () => {
    // The limit is only worth having if the peel it permits is still a peek.
    const anchor = { x: 0, y: H };
    const cap = foldLimit(W, H, anchor, ...unit(1, -1), KEEP);
    const c = creaseFor(anchor, ...unit(1, -1), cap);
    const flapArea = area(foldParts(W, H, c).flap);
    expect(flapArea).toBeGreaterThan(W * H * 0.12);
    // And the bottom edge pulled straight up lifts precisely half the card.
    const up = foldLimit(W, H, { x: W / 2, y: H }, 0, -1, KEEP);
    expect(up).toBeCloseTo(H, 6);
    expect(area(foldParts(W, H, creaseFor({ x: W / 2, y: H }, 0, -1, up)).flap)).toBeCloseTo(
      (W * H) / 2,
      3,
    );
  });

  it('does not restrain anything when the whole card is in play', () => {
    expect(foldLimit(W, H, { x: 0, y: H }, ...unit(1, -1), 0)).toBe(Infinity);
  });
});

describe('no drag can break the card', () => {
  const GAP = 10;
  const PITCH = W + GAP;
  const KEEP = H / 2;
  const DEAD = W * 0.08;

  /** The gesture's arithmetic end to end, exactly as `HoleCards` runs it. */
  function peelAt(grab: Pt, dirX: number, dirY: number, dist: number) {
    const origin = foldOrigin(W, H, dirX, dirY);
    const cap = Math.min(
      foldExtent(W, H, origin, dirX, dirY) * PEEL_FRACTION,
      foldLimit(W, H, origin, dirX, dirY, KEEP),
    );
    const fold = foldAmount(dist, cap / PEEL_OVERSHOOT, DEAD);
    return creaseFor(origin, dirX, dirY, fold);
  }

  it('never strips the card down to a bare flap, wherever it is dragged', () => {
    // Pulling *away* from the card used to put the whole thing on the lifted
    // side at once: the back vanished and the card became a single white
    // triangle. The crease now enters at the point furthest back against the
    // drag, so a fold can only ever grow inwards from an edge.
    let leastFlat = Infinity;
    for (let gx = 0; gx <= PITCH * 2; gx += 11) {
      for (let gy = 0; gy <= H; gy += 11) {
        const held = cardUnder(gx, PITCH, 2);
        const grab = grabAnchor(W, H, { x: gx - held * PITCH, y: gy }, W * 0.34, KEEP);
        let dirX = W / 2 - grab.x;
        let dirY = H / 2 - grab.y;
        const len = Math.hypot(dirX, dirY) || 1;
        dirX /= len;
        dirY /= len;
        for (let fx = -90; fx <= PITCH * 2 + 90; fx += 17) {
          for (let fy = -90; fy <= H + 90; fy += 17) {
            const vx = fx - held * PITCH - grab.x;
            const vy = fy - grab.y;
            const dist = Math.hypot(vx, vy);
            if (dist > 0.001) {
              const nx = vx / dist;
              const ny = vy / dist;
              if (foldExtent(W, H, grab, nx, ny) > 0) {
                dirX = nx;
                dirY = ny;
              }
            }
            const flat = area(foldParts(W, H, peelAt(grab, dirX, dirY, dist)).flat);
            leastFlat = Math.min(leastFlat, flat / (W * H));
          }
        }
      }
    }
    // Comfortably more than half the card is always still lying there.
    expect(leastFlat).toBeGreaterThan(0.5);
  });

  it('never uncovers the top half, however far it is over-dragged', () => {
    // The rubber band used to be worth a further twelve per cent *on top of*
    // the geometric cap, which carried the crease past the midline.
    for (const [dirX, dirY] of [
      unit(1, -1),
      unit(-1, -1),
      [0, -1] as [number, number],
      unit(1, -2),
      unit(-3, -4),
      unit(4, -1),
      [1, 0] as [number, number],
      [-1, 0] as [number, number],
    ]) {
      for (const dist of [0, 20, 60, 140, 400, 5000]) {
        const c = peelAt({ x: 0, y: H }, dirX, dirY, dist);
        for (let x = 0; x <= W; x += 5) {
          for (let y = 0; y <= KEEP; y += 5) {
            expect(
              sideOf({ x, y }, c),
              `dir ${dirX.toFixed(2)},${dirY.toFixed(2)} dist ${dist} uncovered ${x},${y}`,
            ).toBeGreaterThanOrEqual(-1e-9);
          }
        }
      }
    }
  });

  it('starts a fold from the card’s far edge, not from the finger', () => {
    // Straight up: both bottom corners are furthest back, so either will do.
    expect(foldOrigin(W, H, 0, -1).y).toBe(H);
    // Up and to the right: the bottom-left corner is.
    expect(foldOrigin(W, H, ...unit(1, -1))).toEqual({ x: 0, y: H });
    // Up and to the left: the bottom-right.
    expect(foldOrigin(W, H, ...unit(-1, -1))).toEqual({ x: W, y: H });
    // And whatever the direction, the whole card starts out flat.
    for (let a = 0; a < Math.PI * 2; a += 0.15) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const c = creaseFor(foldOrigin(W, H, dx, dy), dx, dy, 0);
      expect(area(foldParts(W, H, c).flat), `angle ${a.toFixed(2)}`).toBeCloseTo(W * H, 3);
    }
  });
});

describe('placing the value on the flap', () => {
  it('finds room inside a shape that has room', () => {
    const square: Poly = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    const fit = fitInside(square, { x: 2, y: 2 }, 8);
    expect(fit.clearance).toBeGreaterThanOrEqual(8 - 1e-6);
  });

  it('reports too little room rather than placing the value off the paper', () => {
    // The bug this replaced: the value drew at low opacity outside a flap that
    // was far too small to hold it. Clearance makes that a measurable fact
    // instead of a guess based on how far the fold had travelled.
    const sliver: Poly = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ];
    expect(fitInside(sliver, { x: 1, y: 1 }, 8).clearance).toBeLessThan(8);
  });

  it('keeps the value inside the flap at every depth of peel', () => {
    for (const g of GRABS) {
      const extent = foldExtent(W, H, g.anchor, g.dir[0], g.dir[1]);
      const r = 9;
      for (let t = 0.1; t <= 1.0001; t += 0.05) {
        const c = creaseFor(g.anchor, g.dir[0], g.dir[1], extent * t);
        const { flap } = foldParts(W, H, c);
        if (flap.length < 3) continue;
        const fit = fitInside(flap, centroid(flap), r);
        // Either it found room, or it honestly says it could not, never a
        // glyph sitting outside the paper.
        if (fit.clearance >= r) {
          expect(clearanceAt(flap, fit), `${g.name} @${t.toFixed(2)}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('settles in the middle of a narrow shape instead of oscillating', () => {
    const strip: Poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 10 },
      { x: 0, y: 10 },
    ];
    const fit = fitInside(strip, { x: 50, y: 1 }, 20);
    expect(fit.y).toBeGreaterThan(3);
    expect(fit.y).toBeLessThan(7);
  });
});

describe('drawing the fold', () => {
  it('turns the card’s own face without mirroring it', () => {
    // A true fold shows the back of the paper, so everything printed on it
    // comes out mirrored, correct, and unreadable. The transform is the
    // reflection composed with a flip about the card's centre line, which
    // cancels the mirroring and leaves the turn. Checked as exactly that
    // composition rather than by restating the arithmetic.
    const anchor = { x: 0, y: H };
    const [dx, dy] = diagonalFrom(anchor);
    for (const dist of [10, 45, 90]) {
      const c = creaseFor(anchor, dx, dy, dist);
      const [a, b, cc, d, e, f] = reflectMatrix(c, true, W);
      for (const p of [{ x: 12, y: 30 }, { x: W, y: 0 }, { x: 40, y: H }]) {
        // Flip about the centre line first, then reflect across the crease.
        const flipped = { x: W - p.x, y: p.y };
        const want = reflectAcross(flipped, c);
        expect(a * p.x + cc * p.y + e).toBeCloseTo(want.x, 6);
        expect(b * p.x + d * p.y + f).toBeCloseTo(want.y, 6);
      }
    }
  });

  it('leaves what it draws readable rather than back to front', () => {
    // A negative determinant is a mirror, and a mirrored index is the whole
    // complaint: a folded 5 reading as a backwards 5.
    for (const dist of [5, 40, 95]) {
      for (const [dx, dy] of [diagonalFrom({ x: 0, y: H }), unit(-1, -1), [0, -1] as [number, number]]) {
        const [a, b, cc, d] = reflectMatrix(creaseFor({ x: 0, y: H }, dx, dy, dist), true, W);
        expect(a * d - cc * b, `dir ${dx},${dy} dist ${dist}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('asks for no movement while nothing is lifted', () => {
    const c = creaseFor({ x: 0, y: H }, ...diagonalFrom({ x: 0, y: H }), 40);
    expect(reflectMatrix(c, false, W)).toEqual([1, 0, 0, 1, 0, 0]);
    // A crease too degenerate to reflect across is likewise nothing to draw.
    expect(reflectMatrix(creaseFor({ x: 0, y: H }, 0, 0, 30), true, W)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('hands the fold over as numbers, never as a transform string', () => {
    // react-native-svg animates a group by calling `setNativeProps`, and `G`
    // runs its JavaScript transform parser there on every frame. That parser
    // cannot read the comma-separated `matrix()` the native side is the only
    // consumer of, so it logged an error per frame for as long as a finger was
    // down; whitespace and translate/rotate/scale abort the process instead.
    // A `matrix` prop skips the parser altogether.
    const c = creaseFor({ x: 0, y: H }, ...diagonalFrom({ x: 0, y: H }), 40);
    const m = reflectMatrix(c, true, W);
    expect(Array.isArray(m)).toBe(true);
    expect(m).toHaveLength(6);
    for (const n of m) expect(Number.isFinite(n)).toBe(true);
  });

  it('clips to the card without inventing vertices', () => {
    const inside: Poly = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
    ];
    expect(clipToCard(inside, W, H)).toHaveLength(3);
    const spilling: Poly = [
      { x: -20, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
    ];
    for (const p of clipToCard(spilling, W, H)) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('shadows only what the flap has uncovered, hugging the crease', () => {
    const anchor = { x: 0, y: H };
    const [dx, dy] = diagonalFrom(anchor);
    const c = creaseFor(anchor, dx, dy, 60);
    const band = 12;
    const shade = foldShadow(W, H, c, band);
    expect(shade.length).toBeGreaterThan(2);
    for (const p of shade) {
      const s = sideOf(p, c);
      // On the uncovered side, and within one band of the crease.
      expect(s).toBeLessThanOrEqual(1e-6);
      expect(s).toBeGreaterThanOrEqual(-band - 1e-6);
    }
  });

  it('has nothing to shadow before the card is lifted', () => {
    const c = creaseFor({ x: 0, y: H }, ...diagonalFrom({ x: 0, y: H }), 0);
    expect(area(foldShadow(W, H, c, 10))).toBeCloseTo(0, 6);
  });

  it('emits a closed SVG path, which is what can actually be animated', () => {
    // Not a polygon: react-native-svg converts `points` to a path at render, so
    // animating it from the UI thread silently freezes the shape.
    const d = pathFromPoly([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(d).toBe('M0.00,0.00L1.00,0.00L1.00,1.00Z');
    expect(pathFromPoly([])).toBe('');
  });

  it('cuts the back’s printing on the same crease as the card', () => {
    const anchor = { x: W, y: H };
    const [dx, dy] = diagonalFrom(anchor);
    const c = creaseFor(anchor, dx, dy, 70);
    const ring = circlePoly(W / 2, H / 2, 20);
    for (const p of clipToFlat(ring, c)) {
      expect(sideOf(p, c)).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('keeps decoration inside the flat region at every fold', () => {
    const anchor = { x: W / 2, y: H };
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const c = creaseFor(anchor, 0, -1, H * t);
      const panel = roundRectPoly(6, 6, W - 12, H - 12, 6);
      for (const p of clipToFlat(panel, c)) {
        expect(sideOf(p, c)).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });

  it('builds a rounded rect that stays within its box', () => {
    for (const p of roundRectPoly(5, 5, 40, 60, 8)) {
      expect(p.x).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(45 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(65 + 1e-9);
    }
  });
});
