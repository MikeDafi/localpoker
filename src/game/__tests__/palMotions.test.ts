import { describe, expect, it } from 'vitest';
import {
  FREE_PAL_MOTION_COSMETIC_IDS,
  PAL_MOTIONS,
  PAL_MOTION_ACCENT_REST,
  PAL_MOTION_REST,
  PURCHASABLE_PAL_MOTIONS,
  palMotionByCosmeticId,
  palMotionByMotionId,
  palMotionCosmeticId,
  palMotionDuration,
  palMotionTrack,
  palMotionTrackIsStill,
  resolvePalMotions,
  type PalMotion,
} from '../palMotions';

const motions = Object.values(PAL_MOTIONS);

describe('the motions themselves', () => {
  it('ships the three the first cut promised', () => {
    expect(motions.map((motion) => motion.motionId)).toEqual(['wave', 'cry', 'shrug']);
  });

  it('keys every motion by its own store id', () => {
    for (const [id, motion] of Object.entries(PAL_MOTIONS)) {
      expect(motion.id, `${id} is filed under the wrong key`).toBe(id);
      expect(id).toBe(palMotionCosmeticId(motion.motionId));
    }
  });

  it('leaves at least one motion free, so the tray is never empty', () => {
    expect(FREE_PAL_MOTION_COSMETIC_IDS.length).toBeGreaterThan(0);
    for (const id of FREE_PAL_MOTION_COSMETIC_IDS) {
      expect(PAL_MOTIONS[id]?.price, `${id} is listed free with a price`).toBe(0);
    }
  });

  it('never sells a free motion, and prices every one it does sell', () => {
    for (const [id, motion] of Object.entries(PURCHASABLE_PAL_MOTIONS)) {
      expect(FREE_PAL_MOTION_COSMETIC_IDS).not.toContain(id);
      expect(Number.isInteger(motion.price), `${id} price`).toBe(true);
      expect(motion.price, `${id} price`).toBeGreaterThan(0);
    }
  });

  it('gives every motion the three swatches its store card draws', () => {
    for (const motion of motions) {
      expect(motion.swatches, `${motion.id} swatches`).toHaveLength(3);
      for (const swatch of motion.swatches) {
        expect(/^#[0-9A-Fa-f]{6}$/.test(swatch), `${motion.id} swatch ${swatch}`).toBe(true);
      }
    }
  });

  /*
   * Offsets are fractions of the Pal's size, not points. A motion tuned in
   * points for the 140pt store preview is invisible on a 42pt seat, which is
   * where it actually has to be read, so anything over about a third of the
   * avatar is a number that was meant to be points.
   */
  it('keeps every offset a sane fraction of the Pal', () => {
    for (const motion of motions) {
      const frames = [...motion.frames, ...(motion.accent?.frames ?? [])];
      for (const frame of frames) {
        expect(Math.abs(frame.translateX ?? 0), `${motion.id} translateX`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(frame.translateY ?? 0), `${motion.id} translateY`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(frame.rotate ?? 0), `${motion.id} rotate`).toBeLessThanOrEqual(30);
        expect(frame.scale ?? 1, `${motion.id} scale`).toBeGreaterThan(0.5);
        expect(frame.scale ?? 1, `${motion.id} scale`).toBeLessThan(1.5);
        expect(frame.duration, `${motion.id} frame duration`).toBeGreaterThan(0);
      }
    }
  });

  it('returns every motion to rest, so a seat cannot be left leaning', () => {
    for (const motion of motions) {
      const last = motion.frames[motion.frames.length - 1]!;
      expect(last.translateX ?? PAL_MOTION_REST.translateX, motion.id).toBe(0);
      expect(last.translateY ?? PAL_MOTION_REST.translateY, motion.id).toBe(0);
      expect(last.rotate ?? PAL_MOTION_REST.rotate, motion.id).toBe(0);
      expect(last.scale ?? PAL_MOTION_REST.scale, motion.id).toBe(1);
    }
  });

  it('fades every accent back out rather than leaving it parked', () => {
    for (const motion of motions) {
      if (!motion.accent) continue;
      const last = motion.accent.frames[motion.accent.frames.length - 1]!;
      expect(last.opacity, `${motion.id} accent`).toBe(0);
    }
  });
});

describe('how long a motion lasts', () => {
  it('counts the longer of the body and the accent', () => {
    const motion: PalMotion = {
      id: 'pal-motion-test',
      motionId: 'test',
      name: 'Test',
      price: 0,
      description: 'Test',
      emoji: '🙂',
      swatches: ['#000000', '#000000', '#000000'],
      face: 'idle',
      frames: [{ duration: 100 }, { duration: 150 }],
      accent: { emoji: '✨', x: 0, y: 0, scale: 0.3, frames: [{ duration: 400 }] },
    };
    expect(palMotionDuration(motion)).toBe(400);
    expect(palMotionDuration({ ...motion, accent: undefined })).toBe(250);
  });

  /*
   * The table holds a reaction bubble for a fixed 2600ms. A motion longer
   * than that is cut off mid gesture on every seat, which reads as a dropped
   * frame rather than as a shrug.
   */
  it('finishes inside the window the table holds a reaction open for', () => {
    for (const motion of motions) {
      expect(palMotionDuration(motion), `${motion.id}`).toBeLessThanOrEqual(2600);
      expect(palMotionDuration(motion), `${motion.id}`).toBeGreaterThan(400);
    }
  });
});

describe('resolving a track', () => {
  it('holds a channel a frame does not mention', () => {
    const frames = [
      { duration: 100, rotate: -8 },
      { duration: 100, scale: 1.1 },
      { duration: 100, rotate: 4 },
    ];
    expect(palMotionTrack(frames, 'rotate').map((step) => step.value)).toEqual([-8, -8, 4]);
    expect(palMotionTrack(frames, 'scale').map((step) => step.value)).toEqual([1, 1.1, 1.1]);
  });

  it('starts from the rest pose it is given', () => {
    const frames = [{ duration: 100 }, { duration: 100, opacity: 1 }];
    expect(palMotionTrack(frames, 'opacity').map((step) => step.value)).toEqual([1, 1]);
    expect(palMotionTrack(frames, 'opacity', PAL_MOTION_ACCENT_REST).map((step) => step.value)).toEqual([0, 1]);
  });

  it('defaults a frame with no easing to the swinging one', () => {
    expect(palMotionTrack([{ duration: 100 }], 'rotate')[0]!.easing).toBe('sine');
    expect(palMotionTrack([{ duration: 100, easing: 'linear' }], 'rotate')[0]!.easing).toBe('linear');
  });

  it('spots a channel that never leaves rest, so it need not animate', () => {
    const frames = [{ duration: 100, rotate: 5 }, { duration: 100, rotate: 0 }];
    expect(palMotionTrackIsStill(palMotionTrack(frames, 'scale'), PAL_MOTION_REST.scale)).toBe(true);
    expect(palMotionTrackIsStill(palMotionTrack(frames, 'rotate'), PAL_MOTION_REST.rotate)).toBe(false);
  });

  it('keeps each step as long as the frame that made it', () => {
    const frames = [{ duration: 120, rotate: 5 }, { duration: 80, rotate: 0 }];
    expect(palMotionTrack(frames, 'rotate').map((step) => step.duration)).toEqual([120, 80]);
  });
});

describe('which motions a player can send', () => {
  it('gives the free ones to someone who owns nothing', () => {
    const free = resolvePalMotions({});
    expect(free.map((motion) => motion.id)).toEqual(FREE_PAL_MOTION_COSMETIC_IDS);
  });

  it('adds the bought ones and nothing else', () => {
    const owned = resolvePalMotions({ owned: ['pal-motion-cry', 'gif-abc', 'chips-candy'] });
    expect(owned.map((motion) => motion.motionId)).toEqual(['wave', 'cry']);
  });

  it('keeps catalogue order, so unlocking one does not reshuffle the tray', () => {
    const owned = resolvePalMotions({ owned: ['pal-motion-shrug', 'pal-motion-cry'] });
    expect(owned.map((motion) => motion.motionId)).toEqual(['wave', 'cry', 'shrug']);
  });
});

describe('looking a motion up', () => {  it('finds one by the id that travels on the wire', () => {
    expect(palMotionByMotionId('wave')?.id).toBe('pal-motion-wave');
    expect(palMotionByMotionId('nonsense')).toBeNull();
    expect(palMotionByMotionId(undefined)).toBeNull();
    expect(palMotionByMotionId('')).toBeNull();
  });

  it('finds one by the id the store sells', () => {
    expect(palMotionByCosmeticId('pal-motion-cry')?.motionId).toBe('cry');
    expect(palMotionByCosmeticId('gif-abc')).toBeNull();
    expect(palMotionByCosmeticId(null)).toBeNull();
  });
});
