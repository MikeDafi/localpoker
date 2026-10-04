/**
 * What a Pal does when you send a motion.
 *
 * A motion is a gesture the player deliberately sends, the way they send an
 * emoji or a GIF: wave hello, cry about a river, shrug at a cooler. It is not
 * the same thing as a `PalExpression`, which is a face the game puts on a Pal
 * for it (gold ring, happy; busted out, sad). A motion holds one of those
 * faces for its whole length and adds the movement, so the two systems share
 * a vocabulary rather than competing.
 *
 * Deliberately data, in the same spirit as `cosmetics.ts`: a motion is a list
 * of poses with durations, so a fourth one is an entry in this file and not a
 * new component. The renderer in `PalMotion.tsx` knows how to play any list
 * of frames and nothing about waving.
 *
 * Offsets are fractions of the Pal's rendered size rather than points,
 * because the same motion has to read on a 42pt seat avatar and a 140pt store
 * preview. In points, anything tuned for the preview is invisible at a seat
 * and anything tuned for a seat throws the preview off its own card.
 */
import { colors } from '../theme/theme';

/** One channel of movement. Everything omitted holds its previous value. */
export interface PalMotionPose {
  /** Sideways offset, as a fraction of the Pal's size. */
  translateX?: number;
  /** Vertical offset, as a fraction of the Pal's size. Negative is up. */
  translateY?: number;
  /** Degrees, clockwise. */
  rotate?: number;
  scale?: number;
  opacity?: number;
}

export type PalMotionChannel = keyof PalMotionPose;

/**
 * Which curve a frame takes to reach its pose.
 *
 * A name rather than a bezier because this file has no business importing an
 * easing library, and three curves cover every gesture: `sine` for anything
 * that swings back and forth, `out` for a snap, `linear` for a fall.
 */
export type PalMotionEasing = 'sine' | 'out' | 'linear';

export interface PalMotionFrame extends PalMotionPose {
  /** Milliseconds spent travelling to this pose. */
  duration: number;
  easing?: PalMotionEasing;
}

/**
 * The faces a motion may wear.
 *
 * A subset of `PalExpression` by name, kept as its own union so pure game
 * logic does not have to import a component. `PalMotion.tsx` assigns this to
 * a `PalExpression`, which is what makes a face PalAvatar cannot draw a
 * compile error rather than a blank stare.
 */
export type PalMotionFace = 'idle' | 'happy' | 'sad' | 'think' | 'surprised';

/** A prop that moves alongside the Pal, for example the hand that waves. */
export interface PalMotionAccent {
  emoji: string;
  /** Resting position from the middle of the Pal, as a fraction of its size. */
  x: number;
  y: number;
  /** Size of the glyph, as a fraction of the Pal's size. */
  scale: number;
  frames: readonly PalMotionFrame[];
}

export interface PalMotion {
  /** Store id, which is what ownership is recorded against. */
  id: string;
  /** Short id that travels on the wire, the way a GIF sends its gif id. */
  motionId: string;
  name: string;
  price: number;
  description: string;
  /** The glyph that stands for the motion in the tray and on the store card. */
  emoji: string;
  swatches: readonly [string, string, string];
  face: PalMotionFace;
  frames: readonly PalMotionFrame[];
  accent?: PalMotionAccent;
}

/** Where a Pal sits when it is doing nothing. */
export const PAL_MOTION_REST: Required<PalMotionPose> = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  scale: 1,
  opacity: 1,
};

/** An accent starts hidden, so a motion without one shows nothing. */
export const PAL_MOTION_ACCENT_REST: Required<PalMotionPose> = {
  ...PAL_MOTION_REST,
  opacity: 0,
};

export const palMotionCosmeticId = (motionId: string): string => `pal-motion-${motionId}`;

const MOTION_LIST: readonly PalMotion[] = [
  {
    id: palMotionCosmeticId('wave'),
    motionId: 'wave',
    name: 'Table Wave',
    // Free, and the only free one. A motion nobody has seen is a category
    // nobody opens, and a wave is the gesture people send when they sit down,
    // so the first table a player joins shows the rest of the table what the
    // feature is. The free emoji emotes are chosen the same way: the friendly
    // ones cost nothing and the loud ones are the upsell.
    price: 0,
    description: 'A friendly hello when you sit down.',
    emoji: '👋',
    swatches: [colors.gold, '#F59E0B', '#FDE68A'],
    face: 'happy',
    frames: [
      { duration: 160, rotate: -9, translateY: -0.07, scale: 1.04, easing: 'out' },
      { duration: 200, rotate: 8, easing: 'sine' },
      { duration: 200, rotate: -8, easing: 'sine' },
      { duration: 200, rotate: 7, easing: 'sine' },
      { duration: 220, rotate: 0, translateY: 0, scale: 1, easing: 'sine' },
    ],
    accent: {
      emoji: '👋',
      x: 0.29,
      y: -0.15,
      scale: 0.36,
      frames: [
        { duration: 120, opacity: 1, rotate: -18, easing: 'out' },
        { duration: 190, rotate: 20, easing: 'sine' },
        { duration: 190, rotate: -18, easing: 'sine' },
        { duration: 190, rotate: 16, easing: 'sine' },
        { duration: 180, rotate: 0, easing: 'sine' },
        { duration: 110, opacity: 0, easing: 'linear' },
      ],
    },
  },
  {
    id: palMotionCosmeticId('cry'),
    motionId: 'cry',
    name: 'Pal Tears',
    price: 300,
    description: 'Full waterworks for a brutal river.',
    emoji: '😭',
    swatches: ['#60A5FA', '#1D4ED8', '#E0F2FE'],
    face: 'sad',
    frames: [
      { duration: 260, translateY: 0.1, scale: 0.955, rotate: -5, easing: 'sine' },
      { duration: 180, rotate: 4, easing: 'sine' },
      { duration: 180, rotate: -4, easing: 'sine' },
      { duration: 180, rotate: 3, easing: 'sine' },
      { duration: 360, translateY: 0, scale: 1, rotate: 0, easing: 'sine' },
    ],
    accent: {
      emoji: '💧',
      x: -0.22,
      y: -0.02,
      scale: 0.3,
      // Two tears rather than one. A single drop finishes long before the Pal
      // straightens up and the rest of the motion reads as a stumble; the
      // 1ms frame is the reset that puts the second tear back at the eye
      // while it is still invisible.
      frames: [
        { duration: 110, opacity: 1, easing: 'out' },
        { duration: 380, translateY: 0.26, easing: 'linear' },
        { duration: 120, opacity: 0, translateY: 0.32, easing: 'linear' },
        { duration: 1, translateY: 0, scale: 0.9, easing: 'linear' },
        { duration: 109, opacity: 1, scale: 1, easing: 'out' },
        { duration: 320, translateY: 0.26, easing: 'linear' },
        { duration: 120, opacity: 0, translateY: 0.32, easing: 'linear' },
      ],
    },
  },
  {
    id: palMotionCosmeticId('shrug'),
    motionId: 'shrug',
    name: 'Pal Shrug',
    price: 350,
    description: 'Who knows. Variance happens.',
    emoji: '🤷',
    swatches: ['#94A3B8', '#334155', '#E2E8F0'],
    face: 'think',
    frames: [
      { duration: 220, translateY: -0.11, scale: 1.035, rotate: -8, easing: 'out' },
      { duration: 260, rotate: 8, easing: 'sine' },
      { duration: 200, rotate: -4, easing: 'sine' },
      { duration: 300, translateY: 0, scale: 1, rotate: 0, easing: 'sine' },
    ],
    accent: {
      emoji: '🤷',
      x: 0.28,
      y: 0.11,
      scale: 0.36,
      frames: [
        { duration: 140, opacity: 1, translateY: -0.045, easing: 'out' },
        { duration: 260, rotate: 14, easing: 'sine' },
        { duration: 220, rotate: -10, easing: 'sine' },
        { duration: 240, rotate: 0, easing: 'sine' },
        { duration: 120, opacity: 0, easing: 'linear' },
      ],
    },
  },
] as const satisfies readonly PalMotion[];

/**
 * Keyed by store id, so a purchase and the thing it buys cannot drift apart.
 * Same reason as the palettes in `cosmetics.ts`: an id on sale with no motion
 * behind it would take the coins and do nothing.
 */
export const PAL_MOTIONS: Record<string, PalMotion> = Object.fromEntries(
  MOTION_LIST.map((motion) => [motion.id, motion]),
);

export const FREE_PAL_MOTION_COSMETIC_IDS: string[] = MOTION_LIST
  .filter((motion) => motion.price === 0)
  .map((motion) => motion.id);

export const PURCHASABLE_PAL_MOTIONS: Record<string, PalMotion> = Object.fromEntries(
  MOTION_LIST.filter((motion) => motion.price > 0).map((motion) => [motion.id, motion]),
);

/**
 * Which motions a player can send.
 *
 * Mirrors `resolveGifEmotes` and `resolveEmojiEmotes`: the free ones plus
 * whatever has been bought, in catalogue order so the tray does not reshuffle
 * itself when something is unlocked.
 */
export function resolvePalMotions(input: { owned?: readonly string[] }): PalMotion[] {
  const ownedSet = new Set(input.owned ?? []);
  const freeSet = new Set(FREE_PAL_MOTION_COSMETIC_IDS);
  return MOTION_LIST.filter((motion) => freeSet.has(motion.id) || ownedSet.has(motion.id));
}

/** The motion a reaction's wire value refers to, or null if it is unknown. */
export function palMotionByMotionId(motionId: string | null | undefined): PalMotion | null {
  if (!motionId) return null;
  return MOTION_LIST.find((motion) => motion.motionId === motionId) ?? null;
}

/** The motion behind a store id, for the store card and its preview. */
export function palMotionByCosmeticId(id: string | null | undefined): PalMotion | null {
  if (!id) return null;
  return PAL_MOTIONS[id] ?? null;
}

const frameLength = (frames: readonly PalMotionFrame[]): number =>
  frames.reduce((total, frame) => total + frame.duration, 0);

/**
 * How long the whole motion takes, in milliseconds.
 *
 * The accent is counted as well as the body, because the tear that is still
 * falling is as much a part of the gesture as the slump that started it, and
 * a bubble pulled off screen mid-drop looks like a dropped frame. The table
 * needs this to decide how long to hold the reaction.
 */
export function palMotionDuration(motion: PalMotion): number {
  return Math.max(frameLength(motion.frames), motion.accent ? frameLength(motion.accent.frames) : 0);
}

export interface PalMotionStep {
  value: number;
  duration: number;
  easing: PalMotionEasing;
}

/**
 * One channel of a motion, resolved into the steps an animation runs.
 *
 * Pure, and the only part of the keyframe format with any logic in it: a
 * frame that leaves a channel out holds whatever the channel was already on,
 * which is what lets a wave describe four rotations without restating a
 * scale it never touches.
 */
export function palMotionTrack(
  frames: readonly PalMotionFrame[],
  channel: PalMotionChannel,
  rest: Required<PalMotionPose> = PAL_MOTION_REST,
): PalMotionStep[] {
  let value = rest[channel];
  return frames.map((frame) => {
    const next = frame[channel];
    if (typeof next === 'number') value = next;
    return { value, duration: frame.duration, easing: frame.easing ?? 'sine' };
  });
}

/** Whether a channel never leaves its resting value, so it need not animate. */
export function palMotionTrackIsStill(steps: readonly PalMotionStep[], restValue: number): boolean {
  return steps.every((step) => step.value === restValue);
}
