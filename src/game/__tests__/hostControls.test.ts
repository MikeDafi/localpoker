import { describe, expect, it } from 'vitest';
import {
  AGREED_SETTING_KEYS,
  COSMETIC_SETTING_KEYS,
  MID_GAME_SAFE_SETTING_KEYS,
  isMidGameSafe,
  pickMidGameSafe,
} from '../hostControls';
import { DEFAULT_GAME_SETTINGS } from '../settings';

describe('mid game host controls', () => {
  /*
   * The whole point of the module. A table is an agreement: people sat down
   * at these stakes. That argument lost: these are play money tables you open
   * for friends, and wanting to lengthen the clock or push the blinds along
   * mid session is ordinary. What is still refused is only what the table
   * could not honour, because the seats are already dealt in.
   */
  it('refuses the settings a live table could not honour', () => {
    for (const key of AGREED_SETTING_KEYS) {
      expect(isMidGameSafe(key), `"${key}" must not be changeable mid game`).toBe(false);
    }
  });

  it('allows the look, the listing, the rules of play and the bots', () => {
    expect([...MID_GAME_SAFE_SETTING_KEYS].sort()).toEqual(
      [
        'ante', 'bigBlind', 'blindLevelLengthHands', 'botSpeed', 'cardBack', 'cardFace',
        'chipStyle', 'difficulty', 'feltStyle', 'mixedDifficulty',
        'roomVisibility', 'smallBlind', 'startingStack', 'turnTimerSec',
      ].sort(),
    );
  });

  /*
   * The two lists must stay disjoint. A key on both would be refused by one
   * rule and allowed by the other, and which won would depend on lookup
   * order, which is the kind of thing that works until it does not.
   */
  it('never calls the same setting both changeable and fixed', () => {
    for (const key of AGREED_SETTING_KEYS) {
      expect(
        (MID_GAME_SAFE_SETTING_KEYS as readonly string[]).includes(key),
        `"${key}" is on both lists`,
      ).toBe(false);
    }
  });

  it('names real settings, so a typo cannot quietly allow nothing', () => {
    for (const key of [...MID_GAME_SAFE_SETTING_KEYS, ...AGREED_SETTING_KEYS]) {
      expect(key in DEFAULT_GAME_SETTINGS, `"${key}" is not a real setting`).toBe(true);
    }
  });

  it('treats an unknown key as unsafe', () => {
    for (const key of ['', 'nonsense', 'BIGBLIND', 'constructor', '__proto__']) {
      expect(isMidGameSafe(key)).toBe(false);
    }
  });

  describe('pickMidGameSafe', () => {
    it('keeps the safe keys', () => {
      expect(pickMidGameSafe({ feltStyle: 'table-lunar', roomVisibility: 'private' })).toEqual({
        feltStyle: 'table-lunar',
        roomVisibility: 'private',
      });
    });

    it('still drops a setting the table cannot honour, beside a safe one', () => {
      const out = pickMidGameSafe({
        feltStyle: 'table-lunar',
        bigBlind: 999_999,
        gameMode: 'turbo',
        numOpponents: 1,
      });
      // The blind goes through now. The seats and the mode do not.
      expect(out).toEqual({ feltStyle: 'table-lunar', bigBlind: 999_999 });
    });

    it('lets the host retune the rules of play', () => {
      const patch = {
        smallBlind: 25, bigBlind: 50, ante: 5,
        startingStack: 12_000, turnTimerSec: 45, blindLevelLengthHands: 6,
      };
      expect(pickMidGameSafe(patch)).toEqual(patch);
    });

    it('returns nothing for an empty or wholly unsafe patch', () => {
      expect(pickMidGameSafe({})).toEqual({});
      expect(pickMidGameSafe({ gameMode: 'cash', numOpponents: 3 })).toEqual({});
    });

    it('does not mutate what it was given', () => {
      const patch = { feltStyle: 'table-lunar', numOpponents: 5 };
      pickMidGameSafe(patch);
      expect(patch).toEqual({ feltStyle: 'table-lunar', numOpponents: 5 });
    });

    it('passes a cosmetic through for every cosmetic key', () => {
      for (const key of COSMETIC_SETTING_KEYS) {
        const patch = { [key]: DEFAULT_GAME_SETTINGS[key] } as Record<string, unknown>;
        expect(pickMidGameSafe(patch)).toEqual(patch);
      }
    });
  });
});
