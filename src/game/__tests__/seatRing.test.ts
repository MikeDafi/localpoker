import { describe, expect, it } from 'vitest';
import {
  EDGE_INSET,
  SEAT_GAP,
  seatArcCounts,
  seatRingBottom,
  seatRingSlot,
  seatsPerRow,
  slotsOverlap,
} from '../seatRing';

/**
 * The screens the app actually runs on, narrowest first. The narrowest is the
 * one that breaks: a pod is a fixed width, so the less screen there is the
 * more of it one pod eats.
 */
const SCREENS = [
  { name: 'iPhone SE', width: 320, height: 210 },
  { name: 'iPhone 13 mini', width: 375, height: 300 },
  { name: 'iPhone 15', width: 393, height: 380 },
  { name: 'iPhone 17 Pro', width: 402, height: 390 },
  { name: 'iPhone 15 Pro Max', width: 430, height: 470 },
];

/** The game allows 1 to 8 computer opponents, see `numOpponents` in settings. */
const SEAT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

/** What `TableScreen` computes for these, kept in step with it. */
const avatarSize = (count: number) => Math.round(Math.max(40, Math.min(66, 74 - count * 5)));
const podWidth = (count: number) => Math.max(62, avatarSize(count) + 20);
const POD_H = 78;

const slotsFor = (count: number, width: number, height: number) =>
  Array.from({ length: count }, (_, index) =>
    seatRingSlot({ index, count, width, height, podWidth: podWidth(count), podHeight: POD_H }),
  );

describe('seatRingSlot', () => {
  /*
   * The bug this module exists for. A real screenshot had eight opponents
   * whose pods were 76pt wide sitting 32pt apart.
   */
  it('never overlaps two pods, at any seat count, on any screen', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const slots = slotsFor(count, screen.width, screen.height);
        for (let a = 0; a < slots.length; a += 1) {
          for (let b = a + 1; b < slots.length; b += 1) {
            expect(
              slotsOverlap(slots[a], slots[b], podWidth(count), POD_H),
              `${screen.name}, ${count} seats: pod ${a} at ${JSON.stringify(slots[a])} overlaps pod ${b} at ${JSON.stringify(slots[b])}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('keeps every pod fully on screen', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        for (const slot of slotsFor(count, screen.width, screen.height)) {
          expect(slot.left).toBeGreaterThanOrEqual(EDGE_INSET - 0.001);
          expect(slot.left + podWidth(count)).toBeLessThanOrEqual(screen.width - EDGE_INSET + 0.001);
          expect(slot.top).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  /*
   * The complaint that produced this design. Seats used to go down the left
   * and right rails, which cost the five community cards nearly half the
   * felt: "the middle cards are too small, have all the players above".
   * Nothing may sit beside the board, so the lowest pod has to clear the top
   * of the lane and the board keeps the full width.
   */
  it('keeps every seat above the board', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const bottom = seatRingBottom({
          count,
          width: screen.width,
          height: screen.height,
          podWidth: podWidth(count),
          podHeight: POD_H,
        });
        for (const slot of slotsFor(count, screen.width, screen.height)) {
          expect(slot.top + POD_H).toBeLessThanOrEqual(bottom + 0.001);
        }
      }
    }
  });

  /*
   * The point of the whole rework: the usual table is one arc, so the board
   * gets the full felt at full height. Five opponents is the default in
   * settings, and six handed is the common game.
   */
  it('seats up to five opponents in a single arc on a real phone', () => {
    for (const screen of SCREENS) {
      if (screen.width < 375) continue;
      for (const count of [1, 2, 3, 4, 5]) {
        expect(
          seatArcCounts(count, screen.width, podWidth(count)),
          `${screen.name}, ${count} seats`,
        ).toEqual([count]);
      }
    }
  });

  it('fills the outer arc before it reaches for a second', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const capacity = seatsPerRow(screen.width, podWidth(count));
        const counts = seatArcCounts(count, screen.width, podWidth(count));
        expect(counts.reduce((n, c) => n + c, 0)).toBe(count);
        for (const c of counts) expect(c).toBeLessThanOrEqual(capacity);
        if (count <= capacity) expect(counts).toEqual([count]);
      }
    }
  });

  /*
   * Six and one reads as a row with a straggler under it. Splitting evenly is
   * what makes two arcs read as the near and far halves of one ring.
   */
  it('splits two arcs evenly rather than leaving a straggler', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const counts = seatArcCounts(count, screen.width, podWidth(count));
        if (counts.length < 2) continue;
        const most = Math.max(...counts);
        const fewest = Math.min(...counts);
        expect(most - fewest, `${screen.name}, ${count} seats: ${counts}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('nests an inner arc inside the one above it', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const slots = slotsFor(count, screen.width, screen.height);
        const outer = slots.filter((s) => s.row === 0);
        const inner = slots.filter((s) => s.row === 1);
        if (inner.length === 0 || outer.length < 2 || inner.length < 2) continue;
        const outerLeft = Math.min(...outer.map((s) => s.left));
        const outerRight = Math.max(...outer.map((s) => s.left));
        const innerLeft = Math.min(...inner.map((s) => s.left));
        const innerRight = Math.max(...inner.map((s) => s.left));
        expect(innerLeft, `${screen.name}, ${count} seats`).toBeGreaterThanOrEqual(outerLeft - 0.001);
        expect(innerRight).toBeLessThanOrEqual(outerRight + 0.001);
      }
    }
  });

  it('spreads the outer arc across the whole stage', () => {
    const count = 4;
    const slots = slotsFor(count, 393, 380).filter((s) => s.row === 0);
    expect(slots.length).toBeGreaterThan(1);
    expect(slots[0].left).toBeCloseTo(EDGE_INSET, 5);
    expect(slots[slots.length - 1].left + podWidth(count)).toBeCloseTo(393 - EDGE_INSET, 5);
  });

  it('centres a lone opponent', () => {
    const [slot] = slotsFor(1, 393, 380);
    expect(slot.left + podWidth(1) / 2).toBeCloseTo(393 / 2, 5);
    expect(slot.row).toBe(0);
  });

  it('keeps neighbours on one arc at least a pod and a gap apart', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const slots = slotsFor(count, screen.width, screen.height);
        for (const row of [0, 1, 2]) {
          const arc = slots.filter((s) => s.row === row).sort((a, b) => a.left - b.left);
          for (let i = 1; i < arc.length; i += 1) {
            expect(
              arc[i].left - arc[i - 1].left,
              `${screen.name}, ${count} seats, arc ${row}`,
            ).toBeGreaterThanOrEqual(podWidth(count) + SEAT_GAP - 0.001);
          }
        }
      }
    }
  });

  it('keeps neighbouring arcs at least a pod height apart, however the curve runs', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const slots = slotsFor(count, screen.width, screen.height);
        for (const a of slots) {
          for (const b of slots) {
            if (a.row >= b.row) continue;
            expect(
              b.top - a.top,
              `${screen.name}, ${count} seats: arc ${a.row} at ${a.top} is too close to arc ${b.row} at ${b.top}`,
            ).toBeGreaterThanOrEqual(POD_H - 0.001);
          }
        }
      }
    }
  });

  it('curves like a rail, flat across the crown and falling at the ends', () => {
    const count = 4;
    const slots = slotsFor(count, 430, 470).filter((s) => s.row === 0);
    expect(slots.length).toBe(count);
    const middle = slots[Math.floor(slots.length / 2)];
    expect(middle.top).toBeLessThan(slots[0].top);
    expect(middle.top).toBeLessThan(slots[slots.length - 1].top);
    // Symmetric about the centre line, or it is not an arc.
    expect(slots[0].top).toBeCloseTo(slots[slots.length - 1].top, 5);
  });

  /*
   * The middle seats used to be pushed down to clear the room code pill. The
   * code moved into the gear menu, so the crown of the arc belongs at the top.
   */
  it('puts the crown of the arc near the top of the stage', () => {
    const slots = slotsFor(3, 393, 380);
    expect(Math.min(...slots.map((s) => s.top))).toBeLessThan(380 * 0.03);
  });

  it('reads left to right along the outer arc before starting the next', () => {
    const slots = slotsFor(8, 393, 380);
    const outer = slots.filter((s) => s.row === 0);
    for (let i = 1; i < outer.length; i += 1) expect(outer[i].left).toBeGreaterThan(outer[i - 1].left);
    const rows = slots.map((s) => s.row);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i]).toBeGreaterThanOrEqual(rows[i - 1]);
  });

  it('clamps a nonsense index and count rather than returning NaN', () => {
    const base = { count: 4, width: 393, height: 380, podWidth: 76, podHeight: POD_H };
    for (const index of [-5, 99, 1.7]) {
      const slot = seatRingSlot({ ...base, index });
      expect(Number.isFinite(slot.left)).toBe(true);
      expect(Number.isFinite(slot.top)).toBe(true);
    }
    const none = seatRingSlot({ ...base, index: 0, count: 0 });
    expect(Number.isFinite(none.left)).toBe(true);
    expect(Number.isFinite(none.top)).toBe(true);
  });

  it('survives a stage narrower than one pod', () => {
    expect(seatsPerRow(60, 76)).toBe(1);
    const slots = Array.from({ length: 4 }, (_, index) =>
      seatRingSlot({ index, count: 4, width: 60, height: 200, podWidth: 76, podHeight: POD_H }),
    );
    for (const slot of slots) {
      expect(Number.isFinite(slot.left)).toBe(true);
      expect(Number.isFinite(slot.top)).toBe(true);
    }
    for (let a = 0; a < slots.length; a += 1) {
      for (let b = a + 1; b < slots.length; b += 1) {
        expect(slotsOverlap(slots[a], slots[b], 76, POD_H)).toBe(false);
      }
    }
  });
});

describe('seatRingBottom', () => {
  it('sits below every pod', () => {
    const input = { count: 8, width: 393, height: 380, podWidth: podWidth(8), podHeight: POD_H };
    const bottom = seatRingBottom(input);
    for (let index = 0; index < input.count; index += 1) {
      expect(seatRingSlot({ ...input, index }).top + POD_H).toBeLessThanOrEqual(bottom + 0.001);
    }
  });

  /*
   * The number that decides how big the community cards are. A single arc has
   * to leave most of the stage to the board, or the rework that produced it
   * bought nothing.
   */
  it('leaves the board most of the stage at the usual table size', () => {
    for (const screen of SCREENS) {
      if (screen.width < 375) continue;
      const bottom = seatRingBottom({
        count: 5,
        width: screen.width,
        height: screen.height,
        podWidth: podWidth(5),
        podHeight: POD_H,
      });
      expect(bottom, `${screen.name}: seats reach ${bottom} of ${screen.height}`)
        .toBeLessThan(POD_H + screen.height * 0.12);
    }
  });

  it('is zero with no opponents', () => {
    expect(seatRingBottom({ count: 0, width: 393, height: 380, podWidth: 76, podHeight: POD_H })).toBe(0);
  });
});
