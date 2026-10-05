/**
 * What a host may change once the cards are already in the air.
 *
 * A table is an agreement. People sat down at 10/20 with a 40,000 stack and a
 * 20 second clock, and those terms are why they are at *this* table rather
 * than another one. A host who can rewrite them mid-session is a host who can
 * change the game out from under everyone, and on a host authoritative model
 * with no server to appeal to, nobody can even prove it happened.
 *
 * So the gear menu at the table offers a deliberately narrow set: things that
 * change how the table *looks*, and whether new people can find it. Nothing
 * that changes what a chip is worth, how long you get to act, or who is dealt
 * in.
 *
 * The real protection is the test beside this file, which asserts that every
 * economic and procedural key is absent. Without it this list is a comment
 * that someone will one day append `bigBlind` to.
 */
import type { GameSettings } from './settings';
import { DEVICE_ONLY_SETTINGS } from './settings';

/**
 * Cosmetic: changes the picture, never the game.
 *
 * These are already published to the room, and everyone at the table sees the
 * host's choice, so changing one mid-hand is visible to all and costs nobody
 * anything.
 */
export const COSMETIC_SETTING_KEYS = [
  'cardBack',
  'feltStyle',
  'chipStyle',
  'cardFace',
] as const;

/**
 * Who can find the table. Changing it never affects anyone already seated,
 * and a host realising mid-session that they would rather not be listed is a
 * real and reasonable thing to want.
 */
export const VISIBILITY_SETTING_KEYS = ['roomVisibility'] as const;

export const MID_GAME_SAFE_SETTING_KEYS = [
  ...COSMETIC_SETTING_KEYS,
  ...VISIBILITY_SETTING_KEYS,
] as const;

export type MidGameSafeSettingKey = (typeof MID_GAME_SAFE_SETTING_KEYS)[number];

const SAFE = new Set<string>(MID_GAME_SAFE_SETTING_KEYS);

export function isMidGameSafe(key: string): key is MidGameSafeSettingKey {
  return SAFE.has(key);
}

/**
 * The terms everyone agreed to by sitting down. Named explicitly rather than
 * derived as "everything else", so that adding a new setting to the game does
 * not silently make it changeable mid-hand: the test requires every one of
 * these to be refused, and a new economic key should be added here.
 */
export const AGREED_SETTING_KEYS = [
  'gameMode',
  'smallBlind',
  'bigBlind',
  'ante',
  'startingStack',
  'maxPlayers',
  'numOpponents',
  'turnTimerSec',
  'difficulty',
  'botSpeed',
  'mixedDifficulty',
] as const satisfies readonly (keyof GameSettings)[];

/** Only the safe keys, so a caller cannot hand the room an agreed term. */
export function pickMidGameSafe(patch: Partial<GameSettings>): Partial<GameSettings> {
  const out: Partial<GameSettings> = {};
  for (const key of Object.keys(patch) as (keyof GameSettings)[]) {
    if (isMidGameSafe(key)) {
      // Narrowed by `isMidGameSafe`, but the index write still needs the cast.
      (out as Record<string, unknown>)[key] = patch[key];
    }
  }
  return out;
}

const DEVICE = new Set<string>(DEVICE_ONLY_SETTINGS);

/**
 * Only the keys that stay on this phone.
 *
 * The counterpart to `pickMidGameSafe`, and the reason the table menu can
 * offer sound, haptics and animation speed to everybody rather than only to
 * the host: none of them reaches the room, so none of them is the host's to
 * grant. Filtered rather than trusted, so a future row in that sheet cannot
 * quietly push an agreed term through the personal door.
 */
export function pickDeviceOnly(patch: Partial<GameSettings>): Partial<GameSettings> {
  const out: Partial<GameSettings> = {};
  for (const key of Object.keys(patch) as (keyof GameSettings)[]) {
    if (DEVICE.has(key)) (out as Record<string, unknown>)[key] = patch[key];
  }
  return out;
}
