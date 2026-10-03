import { describe, expect, it } from 'vitest';
import { LATTICE_REPEATS, latticeTile, rosettePath, rosetteRings } from '../cardBackPattern';

/** Every card size the game actually draws, smallest to largest. */
const SIZES = [18, 24, 32, 44, 58, 72, 86];

describe('latticeTile', () => {
  it('scales the tile with the card so the diamond count never changes', () => {
    for (const size of SIZES) {
      expect(latticeTile(size).pitch).toBeCloseTo(size / LATTICE_REPEATS, 6);
    }
  });

  it('keeps the engraving visible on the smallest card', () => {
    // An 18pt opponent card is where a proportional stroke would round to
    // nothing. The floors exist for this case, so assert it rather than trust.
    const t = latticeTile(18);
    expect(t.primaryStroke).toBeGreaterThanOrEqual(0.3);
    expect(t.secondaryStroke).toBeGreaterThanOrEqual(0.25);
    expect(t.dot).toBeGreaterThan(0);
  });

  it('never lets the line work swallow the tile', () => {
    // Stroke wider than about a sixth of the pitch stops reading as a lattice
    // and turns the card into a solid block of ink.
    for (const size of SIZES) {
      const t = latticeTile(size);
      expect(t.primaryStroke).toBeLessThan(t.pitch / 6);
    }
  });

  it('tiles seamlessly: every line starts and ends on a tile edge', () => {
    // A diagonal that stops inside the tile leaves a visible break at every
    // repeat, which is the one way this pattern can look broken.
    const t = latticeTile(86);
    const onEdge = (x: number, y: number) =>
      Math.abs(x) < 1e-9 ||
      Math.abs(x - t.pitch) < 1e-9 ||
      Math.abs(y) < 1e-9 ||
      Math.abs(y - t.pitch) < 1e-9;
    for (const l of [...t.primary, ...t.secondary]) {
      expect(onEdge(l.x1, l.y1)).toBe(true);
      expect(onEdge(l.x2, l.y2)).toBe(true);
    }
  });

  it('draws only true diagonals, so the weave is symmetric', () => {
    const t = latticeTile(86);
    for (const l of [...t.primary, ...t.secondary]) {
      expect(Math.abs(Math.abs(l.x2 - l.x1) - Math.abs(l.y2 - l.y1))).toBeLessThan(1e-9);
    }
  });

  it('pairs each half-offset diagonal with the piece that completes it', () => {
    // The secondary lines leave the tile and must come back, two per
    // direction, or the half-offset grid breaks at the seam.
    const t = latticeTile(86);
    const down = t.secondary.filter((l) => (l.y2 - l.y1) / (l.x2 - l.x1) > 0);
    const up = t.secondary.filter((l) => (l.y2 - l.y1) / (l.x2 - l.x1) < 0);
    expect(down).toHaveLength(2);
    expect(up).toHaveLength(2);
  });
});

describe('rosettePath', () => {
  it('closes the ring', () => {
    expect(rosettePath(50, 50, 20)).toMatch(/^M.*Z$/);
  });

  it('stays within the amplitude it was given', () => {
    const r = 20;
    const amp = 0.12;
    const pts = [...rosettePath(0, 0, r, 12, amp).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(
      (m) => Math.hypot(Number(m[1]), Number(m[2])),
    );
    expect(Math.min(...pts)).toBeGreaterThanOrEqual(r * (1 - amp) - 0.02);
    expect(Math.max(...pts)).toBeLessThanOrEqual(r * (1 + amp) + 0.02);
  });

  it('actually scallops, rather than drawing a plain circle', () => {
    const pts = [...rosettePath(0, 0, 20, 12, 0.12).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(
      (m) => Math.hypot(Number(m[1]), Number(m[2])),
    );
    expect(Math.max(...pts) - Math.min(...pts)).toBeGreaterThan(1);
  });

  it('samples finely enough to look smooth on the largest card', () => {
    const count = [...rosettePath(0, 0, 20).matchAll(/[ML]/g)].length;
    expect(count).toBeGreaterThanOrEqual(144);
  });
});

describe('rosetteRings', () => {
  it('nests three rings that each stay inside the one before', () => {
    const rings = rosetteRings(50, 71, 20);
    expect(rings).toHaveLength(3);
    const maxRadius = (d: string) =>
      Math.max(
        ...[...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) =>
          Math.hypot(Number(m[1]) - 50, Number(m[2]) - 71),
        ),
      );
    expect(maxRadius(rings[1].d)).toBeLessThan(maxRadius(rings[0].d));
    expect(maxRadius(rings[2].d)).toBeLessThan(maxRadius(rings[1].d));
  });

  it('fades the inner rings so they read as engraving, not as targets', () => {
    const rings = rosetteRings(50, 71, 20);
    expect(rings[0].opacity).toBeGreaterThan(rings[1].opacity);
    expect(rings[1].opacity).toBeGreaterThan(rings[2].opacity);
    for (const ring of rings) expect(ring.opacity).toBeLessThan(0.6);
  });

  it('keeps a visible stroke at the smallest card', () => {
    for (const ring of rosetteRings(9, 12.8, 18 * 0.23 * 1.55)) {
      expect(ring.stroke).toBeGreaterThanOrEqual(0.3);
    }
  });
});
