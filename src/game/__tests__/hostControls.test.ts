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
   * at these stakes, with this stack and this clock. On a host authoritative
   * model there is no server to appeal to, so a host who could rewrite the
   * terms mid-session could change the game out from under everyone and
   * nobody could even prove it.
   */
  it('refuses every term players agreed to by sitting down', () => {
    for (const key of AGREED_SETTING_KEYS) {
      expect(isMidGameSafe(key), `"${key}" must not be changeable mid game`).toBe(false);
    }
  });

  it('allows only cosmetics and who can find the table', () => {
    expect([...MID_GAME_SAFE_SETTING_KEYS].sort()).toEqual(
      ['cardBack', 'cardFace', 'chipStyle', 'feltStyle', 'roomVisibility'].sort(),
    );
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

    it('drops an agreed term even when it arrives beside a safe one', () => {
      const out = pickMidGameSafe({
        feltStyle: 'table-lunar',
        bigBlind: 999_999,
        startingStack: 1,
        turnTimerSec: 1,
      });
      expect(out).toEqual({ feltStyle: 'table-lunar' });
    });

    it('returns nothing for an empty or wholly unsafe patch', () => {
      expect(pickMidGameSafe({})).toEqual({});
      expect(pickMidGameSafe({ bigBlind: 50, ante: 10 })).toEqual({});
    });

    it('does not mutate what it was given', () => {
      const patch = { feltStyle: 'table-lunar', bigBlind: 50 };
      pickMidGameSafe(patch);
      expect(patch).toEqual({ feltStyle: 'table-lunar', bigBlind: 50 });
    });

    it('passes a cosmetic through for every cosmetic key', () => {
      for (const key of COSMETIC_SETTING_KEYS) {
        const patch = { [key]: DEFAULT_GAME_SETTINGS[key] } as Record<string, unknown>;
        expect(pickMidGameSafe(patch)).toEqual(patch);
      }
    });
  });
});
