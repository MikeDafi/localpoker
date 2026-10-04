import { describe, expect, it } from 'vitest';
import {
  EDGE_INSET,
  SEAT_GAP,
  seatRingBottom,
  seatRingSlot,
  seatRow,
  seatRowCount,
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
  { name: 'iPhone 15 Pro Max', width: 430, height: 470 },
];

/** The game allows 1 to 8 computer opponents, see `numOpponents` in settings. */
const SEAT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

/** What `TableScreen` computes for these, kept in step with it. */
const avatarSize = (count: number) => Math.round(Math.max(40, Math.min(66, 74 - count * 5)));
const podWidth = (count: number) => Math.max(76, avatarSize(count) + 34);
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

  it('uses the full width before it reaches for a second row', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const perRow = seatsPerRow(screen.width, podWidth(count));
        const rows = seatRowCount(count, screen.width, podWidth(count));
        expect(rows).toBe(Math.ceil(count / perRow));
        if (count <= perRow) expect(rows).toBe(1);
      }
    }
  });

  it('spreads a row across the whole stage', () => {
    const slots = slotsFor(4, 393, 380);
    const first = slots.filter((_, i) => seatRow(i, 4, 393, podWidth(4)) === 0);
    if (first.length > 1) {
      expect(first[0].left).toBeCloseTo(EDGE_INSET, 5);
      expect(first[first.length - 1].left + podWidth(4)).toBeCloseTo(393 - EDGE_INSET, 5);
    }
  });

  it('centres a lone opponent', () => {
    const [slot] = slotsFor(1, 393, 380);
    expect(slot.left + podWidth(1) / 2).toBeCloseTo(393 / 2, 5);
  });

  it('keeps same row neighbours at least a pod and a gap apart', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const rows = seatRowCount(count, screen.width, podWidth(count));
        const slots = slotsFor(count, screen.width, screen.height);
        for (let i = 0; i + rows < slots.length; i += 1) {
          expect(Math.abs(slots[i + rows].left - slots[i].left)).toBeGreaterThanOrEqual(
            podWidth(count) + SEAT_GAP - 0.001,
          );
        }
      }
    }
  });

  it('curves like a rail while it still fits in one row', () => {
    const count = 4;
    const slots = slotsFor(count, 430, 470);
    if (seatRowCount(count, 430, podWidth(count)) === 1) {
      const middle = slots[Math.floor(slots.length / 2)];
      expect(middle.top).toBeLessThanOrEqual(slots[0].top + 0.001);
    }
  });

  /*
   * The middle seats used to be pushed down to clear the room code pill. The
   * code moved into the gear menu, so the crown of the arc belongs at the top.
   */
  it('puts the crown of a single row arc near the top of the stage', () => {
    const count = 3;
    const slots = slotsFor(count, 393, 380);
    if (seatRowCount(count, 393, podWidth(count)) === 1) {
      expect(Math.min(...slots.map((s) => s.top))).toBeLessThan(380 * 0.03);
    }
  });

  it('stacks rows by exactly a pod height, which is what guarantees clearance', () => {
    const count = 8;
    const screen = SCREENS[0];
    const slots = slotsFor(count, screen.width, screen.height);
    if (seatRowCount(count, screen.width, podWidth(count)) > 1) {
      const tops = [...new Set(slots.map((s) => Math.round(s.top * 100) / 100))].sort((a, b) => a - b);
      for (let i = 1; i < tops.length; i += 1) {
        expect(tops[i] - tops[i - 1]).toBeCloseTo(POD_H, 5);
      }
    }
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
    const slot = seatRingSlot({ index: 2, count: 4, width: 60, height: 200, podWidth: 76, podHeight: POD_H });
    expect(Number.isFinite(slot.left)).toBe(true);
    expect(Number.isFinite(slot.top)).toBe(true);
    expect(seatsPerRow(60, 76)).toBe(1);
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

  it('is finite with no opponents', () => {
    const bottom = seatRingBottom({ count: 0, width: 393, height: 380, podWidth: 76, podHeight: POD_H });
    expect(Number.isFinite(bottom)).toBe(true);
  });
});
