import { describe, expect, it } from 'vitest';
import {
  EDGE_INSET,
  SEAT_GAP,
  seatRingBottom,
  seatRingLane,
  seatRingShape,
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
  { name: 'iPhone 15 Pro Max', width: 430, height: 470 },
];

/** The game allows 1 to 8 computer opponents, see `numOpponents` in settings. */
const SEAT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

/** What `TableScreen` computes for these, kept in step with it. */
const avatarSize = (count: number) => Math.round(Math.max(40, Math.min(66, 74 - count * 5)));
const podWidth = (count: number) => Math.max(66, avatarSize(count) + 26);
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
   * The complaint that produced this module's third design: eight opponents
   * drawn as two flat lines with a pod stranded in the middle of the cloth.
   * Nothing may sit adrift in the felt, which here means the only pods below
   * the top arc are the ones pinned to a rail.
   */
  it('puts every seat on the arc or against a rail, never adrift in the felt', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        for (const slot of slotsFor(count, screen.width, screen.height)) {
          if (slot.side === 'top') continue;
          const rail = slot.side === 'left'
            ? EDGE_INSET
            : screen.width - podWidth(count) - EDGE_INSET;
          expect(
            slot.left,
            `${screen.name}, ${count} seats: a ${slot.side} seat sits at ${slot.left}, off its rail`,
          ).toBeCloseTo(Math.max(EDGE_INSET, rail), 5);
        }
      }
    }
  });

  it('fills the top arc before it reaches for a rail', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const capacity = seatsPerRow(screen.width, podWidth(count));
        const shape = seatRingShape(count, screen.width, podWidth(count));
        expect(shape.top + shape.left + shape.right).toBe(count);
        if (count <= capacity) {
          expect(shape.left + shape.right).toBe(0);
          expect(shape.top).toBe(count);
        }
      }
    }
  });

  /*
   * A single pod hanging off one rail with nothing opposite it reads as a
   * mistake rather than as a ring, so the columns are kept the same depth
   * even when that costs a seat off the arc.
   */
  it('keeps the two rails balanced whenever both exist', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const shape = seatRingShape(count, screen.width, podWidth(count));
        if (seatsPerRow(screen.width, podWidth(count)) < 2) continue;
        if (shape.left + shape.right === 0) continue;
        expect(shape.left, `${screen.name}, ${count} seats`).toBe(shape.right);
        expect(shape.top).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('spreads the top arc across the whole stage', () => {
    const slots = slotsFor(4, 393, 380).filter((s) => s.side === 'top');
    expect(slots.length).toBeGreaterThan(1);
    expect(slots[0].left).toBeCloseTo(EDGE_INSET, 5);
    expect(slots[slots.length - 1].left + podWidth(4)).toBeCloseTo(393 - EDGE_INSET, 5);
  });

  it('centres a lone opponent', () => {
    const [slot] = slotsFor(1, 393, 380);
    expect(slot.left + podWidth(1) / 2).toBeCloseTo(393 / 2, 5);
    expect(slot.side).toBe('top');
  });

  it('keeps neighbours on the arc at least a pod and a gap apart', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const slots = slotsFor(count, screen.width, screen.height).filter((s) => s.side === 'top');
        for (let i = 1; i < slots.length; i += 1) {
          expect(
            slots[i].left - slots[i - 1].left,
            `${screen.name}, ${count} seats`,
          ).toBeGreaterThanOrEqual(podWidth(count) + SEAT_GAP - 0.001);
        }
      }
    }
  });

  it('keeps seats down one rail at least a pod apart', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const slots = slotsFor(count, screen.width, screen.height);
        for (const side of ['left', 'right'] as const) {
          const column = slots
            .filter((s) => s.side === side)
            .map((s) => s.top)
            .sort((a, b) => a - b);
          for (let i = 1; i < column.length; i += 1) {
            expect(
              column[i] - column[i - 1],
              `${screen.name}, ${count} seats, ${side} rail`,
            ).toBeGreaterThanOrEqual(POD_H - 0.001);
          }
        }
      }
    }
  });

  it('curves like a rail, flat across the crown and falling at the ends', () => {
    const count = 4;
    const slots = slotsFor(count, 430, 470).filter((s) => s.side === 'top');
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

  it('runs the seat order up the left rail, across the top, then down the right', () => {
    const slots = slotsFor(8, 393, 380);
    const sides = slots.map((s) => s.side);
    expect(sides.indexOf('top')).toBeGreaterThan(-1);
    /*
     * Once the order reaches the top it never returns to the left rail, and
     * once it reaches the right rail it never returns to the top.
     */
    expect(sides.lastIndexOf('left')).toBeLessThan(sides.indexOf('top'));
    const firstRight = sides.indexOf('right');
    expect(sides.lastIndexOf('top')).toBeLessThan(
      firstRight === -1 ? Number.MAX_SAFE_INTEGER : firstRight,
    );
    // Going up the left rail means seat 0 is the lowest of them.
    const left = slots.filter((s) => s.side === 'left');
    for (let i = 1; i < left.length; i += 1) expect(left[i].top).toBeLessThan(left[i - 1].top);
    const right = slots.filter((s) => s.side === 'right');
    for (let i = 1; i < right.length; i += 1) expect(right[i].top).toBeGreaterThan(right[i - 1].top);
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
    // One column, so the four seats still cannot land on each other.
    for (let a = 0; a < slots.length; a += 1) {
      for (let b = a + 1; b < slots.length; b += 1) {
        expect(slotsOverlap(slots[a], slots[b], 76, POD_H)).toBe(false);
      }
    }
  });
});

describe('seatRingLane', () => {
  const laneFor = (count: number, width: number, height: number) =>
    seatRingLane({ count, width, height, podWidth: podWidth(count), podHeight: POD_H });

  /*
   * The point of the lane: seats beside the board cost it width, not height.
   * Measuring down past a rail seat would push the five cards off the felt to
   * clear something that was never in their way.
   */
  it('clears the top arc without counting the rails', () => {
    for (const screen of SCREENS) {
      for (const count of SEAT_COUNTS) {
        const lane = laneFor(count, screen.width, screen.height);
        const slots = slotsFor(count, screen.width, screen.height);
        for (const slot of slots) {
          if (slot.side !== 'top') continue;
          expect(slot.top + POD_H).toBeLessThanOrEqual(lane.top + 0.001);
        }
        const bottom = seatRingBottom({
          count,
          width: screen.width,
          height: screen.height,
          podWidth: podWidth(count),
          podHeight: POD_H,
        });
        if (slots.some((s) => s.side !== 'top')) {
          expect(lane.top, `${screen.name}, ${count} seats`).toBeLessThan(bottom);
        }
      }
    }
  });

  it('charges width only for the rails that are actually used', () => {
    const empty = laneFor(2, 430, 470);
    expect(empty.leftInset).toBe(0);
    expect(empty.rightInset).toBe(0);

    const full = laneFor(8, 393, 380);
    expect(full.leftInset).toBeGreaterThan(podWidth(8));
    expect(full.rightInset).toBe(full.leftInset);
  });

  it('leaves the board real width to live in at a full ring', () => {
    for (const screen of SCREENS) {
      const lane = laneFor(8, screen.width, screen.height);
      const free = screen.width - lane.leftInset - lane.rightInset;
      expect(free, `${screen.name}: only ${free}pt left for the board`).toBeGreaterThan(150);
    }
  });

  it('is finite with no opponents', () => {
    const lane = seatRingLane({ count: 0, width: 393, height: 380, podWidth: 76, podHeight: POD_H });
    expect(lane.top).toBe(0);
    expect(lane.leftInset).toBe(0);
    expect(lane.rightInset).toBe(0);
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
