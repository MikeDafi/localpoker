/**
 * What a host may change once the cards are already in the air.
 *
 * This used to be a deliberately tiny set: cosmetics, and whether the table
 * was listed. The reasoning was that a table is an agreement, and a host who
 * can rewrite the stakes mid session can change the game out from under
 * everybody with no server to appeal to.
 *
 * The owner of the product overruled that, and on reflection it was solving
 * the wrong problem. These are play money tables you open for your friends,
 * not a cardroom. Wanting to lengthen the clock because somebody keeps timing
 * out, or raise the blinds because the game is dragging, is an ordinary thing
 * to want, and making it impossible meant closing the table and setting it up
 * again. Blinds, stack, clock and the tournament ladder are all open now.
 *
 * What stays shut is only what cannot be honoured. Seats are already dealt
 * in, so the size of the table and the number of bots cannot change under a
 * live hand, and a cash game cannot become a tournament halfway through
 * because the two settle differently. Those are refused because they would
 * not work, not because they would be unfair.
 *
 * The test beside this file pins both halves, so adding a setting to the game
 * cannot quietly land it on either side by accident.
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

/**
 * The rules of the game itself, which the host may now retune mid session.
 *
 * Every one of these is read when a hand STARTS, so changing one lands on the
 * next hand rather than rewriting the hand being played. That is what makes
 * this safe to allow: nobody's current bet, stack or clock moves underneath
 * them.
 */
export const TABLE_RULE_SETTING_KEYS = [
  'smallBlind',
  'bigBlind',
  'ante',
  'blindLevelLengthHands',
  'startingStack',
  'turnTimerSec',
] as const satisfies readonly (keyof GameSettings)[];

/** How the bots play. Harmless to retune between hands. */
export const BOT_SETTING_KEYS = [
  'difficulty',
  'botSpeed',
  'mixedDifficulty',
] as const satisfies readonly (keyof GameSettings)[];

export const MID_GAME_SAFE_SETTING_KEYS = [
  ...COSMETIC_SETTING_KEYS,
  ...VISIBILITY_SETTING_KEYS,
  ...TABLE_RULE_SETTING_KEYS,
  ...BOT_SETTING_KEYS,
] as const;

export type MidGameSafeSettingKey = (typeof MID_GAME_SAFE_SETTING_KEYS)[number];

const SAFE = new Set<string>(MID_GAME_SAFE_SETTING_KEYS);

export function isMidGameSafe(key: string): key is MidGameSafeSettingKey {
  return SAFE.has(key);
}

/**
 * Settings that cannot change while a table is live, because the table could
 * not honour the change.
 *
 * Seats are taken and bots are dealt in, so the size of the game is fixed for
 * the session, and a cash game cannot turn into a tournament mid flight
 * because busting means something different in each. Named explicitly rather
 * than derived as "everything else", so a new setting has to be placed on
 * purpose.
 */
export const AGREED_SETTING_KEYS = [
  'gameMode',
  'maxPlayers',
  'numOpponents',
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
