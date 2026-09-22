/**
 * Geometry for peeling a card open by folding part of it back.
 *
 * A peel is not a card swinging away on a hinge — that reads as a pocket knife
 * opening. A real peel bends the card along a crease: the far part stays flat
 * on the table while the near part folds *back over itself*, uncovering what
 * was underneath. The crease travels across the card as you lift, so the
 * uncovered wedge grows and the flat part shrinks.
 *
 * The crease is not fixed. Fold a piece of paper by pinning one point and
 * dragging it somewhere else, and the crease that forms is the *perpendicular
 * bisector* of the line between where that point started and where it now is.
 * Nothing else is possible: the dragged point has to end up the same distance
 * from the crease as it started, on the other side.
 *
 * That single fact is the whole model here, and it is why this file has no
 * notion of "corners" at all:
 *
 *   - Pin a corner and drag it toward the middle → the crease comes out at 45°
 *     and the flap is the familiar triangular dog-ear.
 *   - Pin the middle of the bottom edge and drag straight up → the crease comes
 *     out horizontal and the whole bottom strip lifts. An edge peel.
 *   - Pin a point on the side and drag across → a vertical crease, and the side
 *     folds in.
 *
 * An earlier version hard-coded a 45° crease through a chosen corner, which
 * meant only corners could ever be peeled and the fold angle never responded to
 * how you actually dragged. Deriving the crease from the drag instead makes
 * every one of those cases the same three lines of maths, and makes the card
 * follow your finger rather than snapping to one of four presets.
 *
 * Everything is in card space: x runs across the card's width, y down its
 * height, origin at the top-left. There is no mirrored coordinate system to
 * keep in your head and no transform to undo.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Poly = Pt[];

/**
 * A fold line, as the set of points where `nx * x + ny * y === d`.
 *
 * `(nx, ny)` is a unit vector pointing from the part being lifted toward the
 * part still lying flat, which fixes the sign of every half-plane test below:
 * `n · p >= d` is flat, `n · p <= d` is being peeled away.
 */
export interface Crease {
  nx: number;
  ny: number;
  d: number;
}

/** The four corners of a w×h card. */
function rect(w: number, h: number): Poly {
  'worklet';
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/**
 * The crease produced by pinning `anchor` and dragging it `dist` in direction
 * `(dirX, dirY)`.
 *
 * It sits halfway along the drag and square to it, which is the only place a
 * fold can be: the pinned point has to land exactly under your finger, and a
 * reflection preserves distance, so the crease must be the perpendicular
 * bisector.
 *
 * `dist === 0` is deliberately not a special case. The crease then passes
 * through the anchor itself, and because the anchor sits on the card's boundary
 * with `n` pointing inward, every point of the card tests as flat — a card that
 * has not been lifted at all, with no branch needed to say so.
 *
 * `(dirX, dirY)` must be a unit vector; callers hold it as one so this stays
 * cheap enough to run per frame on the UI thread.
 */
export function creaseFor(anchor: Pt, dirX: number, dirY: number, dist: number): Crease {
  'worklet';
  return {
    nx: dirX,
    ny: dirY,
    d: dirX * anchor.x + dirY * anchor.y + dist * 0.5,
  };
}

/**
 * Whether a crease describes a real fold.
 *
 * The normal has to be a direction. If it collapses to zero — which a gesture
 * can produce the instant a finger lands, before it has moved anywhere — then
 * every point of the card sits exactly *on* the crease, so the half-plane tests
 * that split the card both answer "yes" and the card ends up simultaneously
 * flat and folded: the flap comes out as a perfect copy of the whole card,
 * drawn over the top of it. A card with no fold in it should read as a card
 * with no fold in it, so that case is caught here rather than at each of the
 * six call sites that would otherwise have to remember.
 *
 * Defined above everything that calls it, and not below where it reads better:
 * Reanimated builds each worklet's closure as the module evaluates, in source
 * order, so a worklet declared after its caller is simply missing on the UI
 * thread. It throws `undefined is not a function` on device and nowhere else —
 * unit tests, where hoisting applies normally, pass either way.
 */
function isFolded(c: Crease): boolean {
  'worklet';
  // The offset is checked for being a real number as well as the normal for
  // being a direction. Nothing upstream should produce a `NaN` any more, but
  // one arriving here would be turned into `matrix(NaN,...)` and a stream of
  // errors from inside the rendering libraries, so it is cheap to stop it at
  // the one place every drawn shape passes through.
  return c.nx * c.nx + c.ny * c.ny > 0.25 && c.d - c.d === 0;
}

/** Signed distance from `p` to the crease: positive on the flat side. */
export function sideOf(p: Pt, c: Crease): number {
  'worklet';
  return c.nx * p.x + c.ny * p.y - c.d;
}

/**
 * Mirror a point across the crease.
 *
 * This is what makes the flap a genuine fold rather than a second copy of the
 * card: the lifted material is the peeled region turned over about the crease,
 * so it is congruent to the hole it leaves behind and its ends stay pinned to
 * the crease exactly where the flat part ends.
 */
export function reflectAcross(p: Pt, c: Crease): Pt {
  'worklet';
  const s = sideOf(p, c) * 2;
  return { x: p.x - s * c.nx, y: p.y - s * c.ny };
}

/**
 * Sutherland–Hodgman clip of a convex polygon against one half-plane.
 *
 * `inside(p)` is a signed distance rather than a boolean so the crossing point
 * can be found by interpolation, which keeps the cut exact instead of snapping
 * to whichever vertex is nearest.
 */
function clipHalfPlane(poly: Poly, side: (p: Pt) => number): Poly {
  'worklet';
  if (poly.length === 0) return poly;
  const out: Poly = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const dCur = side(cur);
    const dPrev = side(prev);
    const curIn = dCur >= 0;
    const prevIn = dPrev >= 0;
    if (curIn !== prevIn) {
      const t = dPrev / (dPrev - dCur);
      out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
    }
    if (curIn) out.push(cur);
  }
  return out;
}

/** Trim a polygon to the card's own bounds. */
export function clipToCard(poly: Poly, w: number, h: number): Poly {
  'worklet';
  let p = clipHalfPlane(poly, (q) => q.x);
  p = clipHalfPlane(p, (q) => w - q.x);
  p = clipHalfPlane(p, (q) => q.y);
  p = clipHalfPlane(p, (q) => h - q.y);
  return p;
}

export interface FoldParts {
  /** The part still lying flat, showing the card back. */
  flat: Poly;
  /** The lifted part, folded back over the card: the card's own face. */
  flap: Poly;
}

/**
 * Split a card into the part still flat and the part folded back over it.
 *
 * The flap is clipped to the card so a deep peel cannot spill onto whatever is
 * next to it; by the time that clipping bites, the overhang would be folded
 * past the card's far edge anyway.
 */
export function foldParts(w: number, h: number, c: Crease): FoldParts {
  'worklet';
  const card = rect(w, h);
  if (!isFolded(c)) return { flat: card, flap: [] };
  const flat = clipHalfPlane(card, (p) => sideOf(p, c));
  const peeled = clipHalfPlane(card, (p) => -sideOf(p, c));
  const flap = clipToCard(
    peeled.map((p) => reflectAcross(p, c)),
    w,
    h,
  );
  return { flat, flap };
}

/**
 * Trim any shape to the part of the card still lying flat.
 *
 * The back's printing has to be cut by the crease along with the card stock
 * itself, or the pattern floats on over the fold and the illusion collapses.
 * Reusing the card body's own clip guarantees they are cut on the same line.
 */
export function clipToFlat(poly: Poly, c: Crease): Poly {
  'worklet';
  if (!isFolded(c)) return poly;
  return clipHalfPlane(poly, (p) => sideOf(p, c));
}

/** A circle as a polygon, so it can be cut by the crease like everything else. */
export function circlePoly(cx: number, cy: number, r: number, segments = 24): Poly {
  'worklet';
  const pts: Poly = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** A rounded rectangle as a polygon, for the same reason. */
export function roundRectPoly(x: number, y: number, w: number, h: number, r: number, perCorner = 5): Poly {
  'worklet';
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  const pts: Poly = [];
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2],
    [x + w - rr, y + h - rr, 0],
    [x + rr, y + h - rr, Math.PI / 2],
    [x + rr, y + rr, Math.PI],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = start + (i / perCorner) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
  }
  return pts;
}

/**
 * The strip of uncovered card that the lifted flap shadows.
 *
 * A folded-back piece throws a shadow onto whatever it has just uncovered, and
 * without one the flap looks printed on rather than lifted. The band hugs the
 * crease on the uncovered side, so it tracks the fold exactly and never darkens
 * the part still lying flat.
 */
export function foldShadow(w: number, h: number, c: Crease, band: number): Poly {
  'worklet';
  if (!isFolded(c)) return [];
  const peeled = clipHalfPlane(rect(w, h), (p) => -sideOf(p, c));
  return clipHalfPlane(peeled, (p) => sideOf(p, c) + band);
}

/**
 * The crease itself, as the segment where it crosses the card.
 *
 * Taken from the flat part's own outline rather than by intersecting the line
 * with each edge in turn: the two points are by definition the vertices the
 * clip introduced, so they agree with the drawn shapes to the last decimal and
 * cannot drift apart from them.
 */
export function creaseSegment(w: number, h: number, c: Crease): [Pt, Pt] | null {
  'worklet';
  if (!isFolded(c)) return null;
  const flat = clipHalfPlane(rect(w, h), (p) => sideOf(p, c));
  const on: Poly = [];
  for (const p of flat) {
    if (Math.abs(sideOf(p, c)) < 1e-6) on.push(p);
  }
  if (on.length < 2) return null;
  // A convex cut yields exactly two such vertices; if a card corner happens to
  // sit on the line there can be more, and the extreme pair is the segment.
  let a = on[0];
  let b = on[1];
  let best = -1;
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      const dx = on[i].x - on[j].x;
      const dy = on[i].y - on[j].y;
      const d2 = dx * dx + dy * dy;
      if (d2 > best) {
        best = d2;
        a = on[i];
        b = on[j];
      }
    }
  }
  return [a, b];
}

/** How far inside `poly` the point `p` is: 0 on the boundary, negative outside. */
export function clearanceAt(poly: Poly, p: Pt): number {
  'worklet';
  if (poly.length < 3) return -Infinity;
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  const s = area2 >= 0 ? 1 : -1;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-9) continue;
    // Inward normal, orientation-corrected so this works for either winding.
    const nx = (-ey / len) * s;
    const ny = (ex / len) * s;
    const dist = nx * (p.x - a.x) + ny * (p.y - a.y);
    if (dist < min) min = dist;
  }
  return min === Infinity ? -Infinity : min;
}

/** The average of a polygon's vertices — a cheap, always-inside seed point. */
export function centroid(poly: Poly): Pt {
  'worklet';
  if (poly.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export interface Fitted {
  x: number;
  y: number;
  /** Room actually achieved. Less than `r` means the shape is too small. */
  clearance: number;
}

/**
 * Nudge a point until a disc of radius `r` around it fits inside `poly`.
 *
 * This is what decides where the card's value can be printed on the lifted
 * flap. Placing it at the flap's centroid alone is not enough — a centroid sits
 * inside the shape but says nothing about how much room is around it, so on a
 * shallow peel the glyph spilled over the crease and floated on the card back.
 * Pushing off every edge that crowds it converges on somewhere with real room,
 * and reporting the clearance it managed lets the caller fade the value in only
 * once the paper can actually hold it, rather than guessing from the fold
 * distance.
 *
 * Convex polygons only, which every flap is: a rectangle cut by half-planes
 * stays convex, and reflecting it preserves that.
 */
export function fitInside(poly: Poly, target: Pt, r: number, passes = 16): Fitted {
  'worklet';
  if (poly.length < 3) return { x: target.x, y: target.y, clearance: -Infinity };
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  const s = area2 >= 0 ? 1 : -1;

  let px = target.x;
  let py = target.y;
  for (let pass = 0; pass < passes; pass++) {
    const worst = r - clearanceAt(poly, { x: px, y: py });
    if (worst <= 1e-6) break;

    // The move that would satisfy every crowding edge at once. When the edges
    // are independent — a corner of the flap pinching from two sides — this
    // lands exactly right in a single step.
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.sqrt(ex * ex + ey * ey);
      if (len < 1e-9) continue;
      const nx = (-ey / len) * s;
      const ny = (ex / len) * s;
      const dist = nx * (px - a.x) + ny * (py - a.y);
      if (dist < r) {
        sx += nx * (r - dist);
        sy += ny * (r - dist);
      }
    }
    // Balanced: every push cancels, so this is already the roomiest spot there
    // is and the shape is simply too small. Stop rather than jitter.
    if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) break;

    // When the edges *do* fight — a flap narrower than the glyph, where moving
    // off one edge drives you into the one opposite — the full step overshoots
    // and the point ping-pongs forever. Backing off until the move actually
    // improves the worst case converges on the middle instead, which is where
    // the value should sit while it fades out.
    let step = 1;
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const qx = px + sx * step;
      const qy = py + sy * step;
      if (r - clearanceAt(poly, { x: qx, y: qy }) < worst - 1e-9) {
        px = qx;
        py = qy;
        moved = true;
        break;
      }
      step *= 0.5;
    }
    if (!moved) break;
  }
  return { x: px, y: py, clearance: clearanceAt(poly, { x: px, y: py }) };
}

/**
 * Where a touch grabs the card.
 *
 * You cannot peel from the middle of a sheet of paper — a fold has to start at
 * an edge — so the touch is pulled to the nearest point on the card's boundary,
 * and to an actual corner when it is near enough that a corner is obviously
 * what was meant. That corner snap is the only concession to presets in the
 * whole model, and it exists because fingers are blunt: without it, grabbing a
 * corner almost always lands a pixel or two along one edge and folds a thin
 * lopsided sliver instead of the dog-ear you asked for.
 *
 * `minY` keeps folds out of the top of the card. Hole cards are held at the
 * bottom edge and lifted towards you, so that is the only half worth peeling;
 * allowing the top means a card can be folded away from the very corner your
 * thumb is resting on, which reads as the card coming apart rather than being
 * looked at.
 */
export function grabAnchor(w: number, h: number, touch: Pt, cornerZone: number, minY = 0): Pt {
  'worklet';
  const x = Math.max(0, Math.min(w, touch.x));
  // A fold may not start above `minY`, so a touch up there is pulled down to
  // the highest point one may start from.
  const y = Math.max(minY, Math.min(h, touch.y));
  const dx = Math.min(x, w - x);
  const nearX = x <= w - x ? 0 : w;
  // The bottom edge is always available; the top only when the whole card is in
  // play. `minY` is a limit, not a new edge to fold from, so when it is set the
  // top simply stops being a candidate rather than being replaced by the line.
  const toTop = minY <= 0 ? y : Infinity;
  const toBottom = h - y;
  const dy = Math.min(toTop, toBottom);
  const nearY = toTop <= toBottom ? 0 : h;
  if (dx <= cornerZone && dy <= cornerZone) return { x: nearX, y: nearY };
  // Otherwise slide onto whichever reachable edge is closest, keeping the other
  // coordinate where the finger is.
  return dx <= dy ? { x: nearX, y } : { x, y: nearY };
}

/**
 * How far past its range a peel may be dragged before it stops moving at all.
 *
 * A hard stop feels like hitting a wall; letting the last stretch ease keeps it
 * feeling like something being bent. The caller is expected to hand
 * `foldAmount` a range that is this much *short* of the real geometric limit,
 * so the resistance plays out inside what the card can actually do rather than
 * past it.
 */
export const PEEL_OVERSHOOT = 1.12;

/**
 * How far the fold has been pulled, given how far the finger is from the pinned
 * point and how much room there is that way.
 *
 * Extracted from the gesture so it can be tested, because the interesting cases
 * are the ones a gesture reaches and a scripted animation never does. Dragging
 * *away* from the card leaves no room to fold into — `reach` is zero — and the
 * obvious arithmetic then divides zero by zero. The resulting `NaN` travels all
 * the way into the fold's transform and the card's lift, where it surfaces as a
 * stream of errors from deep inside the rendering libraries with nothing to say
 * about where it came from.
 */
export function foldAmount(dist: number, reach: number, dead: number): number {
  'worklet';
  if (!(reach > 0) || !(dist > dead)) return 0;
  const over = (dist - dead) / reach;
  // Past the end of the range the card resists instead of stopping dead. A hard
  // clamp feels like hitting a wall; easing the last stretch keeps it feeling
  // like something being bent.
  const eased = over <= 1 ? over : 1 + (1 - 1 / (1 + (over - 1) * 2)) * (PEEL_OVERSHOOT - 1);
  return Math.min(PEEL_OVERSHOOT, eased) * reach;
}

/**
 * Where a fold in direction `(dirX, dirY)` has to begin.
 *
 * Not where your finger is — where the card *starts*. The crease is square to
 * the drag, so for the fold to grow from nothing it has to enter the card at
 * the point furthest back against the drag, and sweep forwards from there.
 *
 * Pinning the crease to the finger instead is subtly broken, and was: grab the
 * middle of an edge, pull at any angle other than straight in, and the crease
 * through your finger already cuts a corner off, so the card springs open with
 * a piece lifted before you have moved. Pull *outward* and the entire card ends
 * up on the lifted side at once — the back disappears and the card becomes a
 * single white triangle.
 *
 * For the grabs that matter this changes nothing: drag a corner diagonally and
 * that corner is already the furthest-back point, and pull an edge straight in
 * and both of its corners are. It only takes effect where the old behaviour was
 * indefensible.
 */
export function foldOrigin(w: number, h: number, dirX: number, dirY: number): Pt {
  'worklet';
  let best: Pt = { x: 0, y: 0 };
  let least = Infinity;
  const xs = [0, w];
  const ys = [0, h];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const proj = dirX * xs[i] + dirY * ys[j];
      if (proj < least) {
        least = proj;
        best = { x: xs[i], y: ys[j] };
      }
    }
  }
  return best;
}

/**
 * How far the card can be folded from `anchor` in direction `(dirX, dirY)`.
 *
 * Measured as the card's own extent that way, so it adapts to what is actually
 * being folded: a corner dragged along the diagonal has the full diagonal to
 * travel, while an edge lifted straight up only has the card's height. A fixed
 * limit would either fold a corner barely at all or fold an edge clean off.
 */
export function foldExtent(w: number, h: number, anchor: Pt, dirX: number, dirY: number): number {
  'worklet';
  let max = 0;
  for (const p of rect(w, h)) {
    const proj = dirX * (p.x - anchor.x) + dirY * (p.y - anchor.y);
    if (proj > max) max = proj;
  }
  return max;
}

/**
 * How far a peel may travel, as a fraction of the room available that way.
 *
 * `foldExtent` measures how far the card reaches in the direction being pulled,
 * and a drag of exactly that would put the crease across the card's middle and
 * fold it clean in half. Just under three-quarters of it lifts a piece big
 * enough to print the value on — including on a side fold, whose flap is only
 * half as wide as the drag is long, and which is therefore what sets this
 * number.
 */
export const PEEL_FRACTION = 0.72;

/**
 * Which card of a row a touch is over.
 *
 * The cards are laid out on a fixed pitch, so this is a division — but it must
 * be asked exactly *once*, when the finger lands. Asking it again on every
 * frame is what made dragging between two cards glitch: the pinned point stays
 * on the card that was grabbed while the finger's position starts being
 * measured from its neighbour, so the moment the finger crosses the gap the
 * fold jumps by the whole pitch.
 *
 * A touch in the gap belongs to the card on its left, and a touch past either
 * end belongs to the nearest card, so there is nowhere in the row that fails to
 * grab something.
 */
export function cardUnder(x: number, pitch: number, count: number): number {
  'worklet';
  if (!(pitch > 0) || count < 1) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(x / pitch)));
}

/**
 * How far the fold may be pulled before it starts uncovering protected card.
 *
 * Limiting where a peel *begins* is not the same as limiting what it exposes,
 * and only the second is what anyone means by "peel the bottom half". A grab on
 * the side at the midline starts legally and still folds the card across its
 * full height, laying the whole face open — which is the bug this exists to
 * stop.
 *
 * The rule is simply that every corner of the protected region has to stay on
 * the flat side of the crease. Since the crease sits half the drag beyond the
 * pinned point, that turns directly into a cap on the drag.
 *
 * It falls out sensibly for each way of grabbing: a corner dragged diagonally
 * stops when the crease touches the midline, lifting a generous dog-ear; the
 * bottom edge pulled straight up stops having lifted exactly the bottom half;
 * and a sideways pull at the midline, which could only ever expose everything,
 * is pinned to zero.
 */
export function foldLimit(
  w: number,
  h: number,
  anchor: Pt,
  dirX: number,
  dirY: number,
  keepAbove: number,
): number {
  'worklet';
  if (keepAbove <= 0) return Infinity;
  // The protected region is the strip above `keepAbove`; being a rectangle, its
  // corners are the only points that can bind.
  let nearest = Infinity;
  const xs = [0, w];
  const ys = [0, keepAbove];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const proj = dirX * xs[i] + dirY * ys[j];
      if (proj < nearest) nearest = proj;
    }
  }
  return Math.max(0, 2 * (nearest - (dirX * anchor.x + dirY * anchor.y)));
}

/** A 2D affine in SVG's `matrix(a b c d e f)` order. */
export type Affine = [number, number, number, number, number, number];

/**
 * The reflection across the crease, as six numbers.
 *
 * This is what turns the lifted piece into a genuine fold rather than a
 * stand-in: the card's *own* face is drawn through it, so whatever is printed
 * on the part you lifted — pips, index, court figure — rides up on the paper
 * and lands mirrored about the bend, exactly as it does in your hands.
 *
 * Numbers rather than a transform string, and that took a while to arrive at.
 * react-native-svg animates a group by calling `setNativeProps`, and `G`'s
 * implementation runs the *JavaScript* transform parser on every frame — a
 * parser that rejects the comma-separated `matrix()` the native side is the
 * only consumer of, logging an error per frame for as long as a finger is down.
 * Whitespace instead aborts the process outright, as does writing the same
 * reflection out as translate/rotate/scale.
 *
 * But `G.setNativeProps` skips all of that when handed a `matrix` prop
 * directly. Six numbers go straight through to the native side with nothing
 * parsing them, which is why this returns an array and the component sets
 * `matrix` rather than `transform`.
 *
 * Reflecting a point across `n · p = d` is `p − 2(n · p − d)n`, which in the
 * order SVG wants is:
 *
 *     x' = (1 − 2nx²)x +  (−2 nx ny)y + 2 d nx
 *     y' =  (−2 nx ny)x + (1 − 2ny²)y + 2 d ny
 */
export function reflectMatrix(c: Crease, lifted: boolean, w: number): Affine {
  'worklet';
  // Written out rather than named, because a worklet's closure is built as the
  // module evaluates, in source order: a constant declared below this function
  // is simply absent on the UI thread, and that reads as a hard crash
  // mid-animation with no stack in JS.
  if (!lifted || !isFolded(c)) return [1, 0, 0, 1, 0, 0];
  const a = 1 - 2 * c.nx * c.nx;
  const b = -2 * c.nx * c.ny;
  const d = 1 - 2 * c.ny * c.ny;
  const e = 2 * c.d * c.nx;
  const f = 2 * c.d * c.ny;
  // Composed with a flip about the card's own centre line, which turns the
  // reflection into a rotation and is the one place this departs from the
  // physics. A true fold shows you the back of the paper, so everything printed
  // on it comes out mirrored — correct, and unreadable: a folded 5 reads as a
  // backwards 5, and the whole point of the gesture is reading your hand. The
  // extra flip cancels the mirroring while leaving the turn, so the value still
  // swings round with the fold but stays the right way round.
  //
  // It costs nothing in fidelity, because a flip about the centre line is a
  // symmetry of the card: the pips sit in columns at a quarter, a half and
  // three quarters, and the index is printed at all four corners, so the
  // content brought into view is the same content either way.
  return [-a, -b, b, d, a * w + e, b * w + f];
}

/**
 * Format a polygon as an SVG path.
 *
 * Paths rather than polygons because `points` does not survive being animated:
 * react-native-svg turns it into a path when it renders, so driving it from the
 * UI thread leaves the shape frozen at whatever it was first given while every
 * other animated prop carries on moving. `d` is animated natively and behaves.
 */
export function pathFromPoly(poly: Poly): string {
  'worklet';
  if (poly.length === 0) return '';
  let d = `M${poly[0].x.toFixed(2)},${poly[0].y.toFixed(2)}`;
  for (let i = 1; i < poly.length; i++) {
    d += `L${poly[i].x.toFixed(2)},${poly[i].y.toFixed(2)}`;
  }
  return `${d}Z`;
}
