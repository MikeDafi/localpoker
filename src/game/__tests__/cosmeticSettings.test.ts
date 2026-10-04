import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_SCHEMA,
  availableSettingOptions,
  type SettingField,
} from '../settings';
import {
  CARD_BACK_PALETTES,
  CHIP_PALETTES,
  CLASSIC_CARD_BACK,
  CLASSIC_CHIPS,
  CLASSIC_FELT,
  FELT_PALETTES,
  STARTER_CARD_BACKS,
} from '../cosmetics';

const fieldFor = (key: string): SettingField => {
  for (const group of SETTINGS_SCHEMA) {
    const found = group.fields.find((f) => f.key === key);
    if (found) return found;
  }
  throw new Error(`no setting field ${key}`);
};

const CASES = [
  { key: 'feltStyle', palettes: FELT_PALETTES, free: [CLASSIC_FELT] },
  { key: 'chipStyle', palettes: CHIP_PALETTES, free: [CLASSIC_CHIPS] },
  { key: 'cardBack', palettes: CARD_BACK_PALETTES, free: [...STARTER_CARD_BACKS] },
] as const;

describe('cosmetic settings', () => {
  /*
   * The drift this prevents: a cosmetic gets a palette and goes on sale in
   * the Store, but nobody adds it to the game setup picker, so buying it
   * takes the coins and the table can never actually be set to it. That has
   * already happened twice in this codebase by other routes.
   */
  it('offers every palette that exists, so a bought cosmetic can be chosen', () => {
    for (const { key, palettes } of CASES) {
      const offered = new Set((fieldFor(key).options ?? []).map((o) => String(o.value)));
      for (const id of Object.keys(palettes)) {
        expect(offered.has(id), `${key} picker is missing "${id}"`).toBe(true);
      }
    }
  });

  it('offers nothing that has no palette behind it', () => {
    for (const { key, palettes } of CASES) {
      for (const option of fieldFor(key).options ?? []) {
        expect(String(option.value) in palettes, `${key} offers "${option.value}" with no palette`).toBe(true);
      }
    }
  });

  /*
   * "Equipped" was an indirection: the setting said Equipped and you had to
   * open another screen to find out what that meant. The picker now names
   * real felts and chips.
   */
  it('no longer offers the Equipped indirection', () => {
    for (const { key } of CASES) {
      const values = (fieldFor(key).options ?? []).map((o) => String(o.value));
      expect(values).not.toContain('equipped');
    }
  });

  it('defaults to something concrete that every player owns', () => {
    expect(DEFAULT_GAME_SETTINGS.feltStyle).toBe(CLASSIC_FELT);
    expect(DEFAULT_GAME_SETTINGS.chipStyle).toBe(CLASSIC_CHIPS);
    expect(DEFAULT_GAME_SETTINGS.cardBack).toBe(CLASSIC_CARD_BACK);
    for (const { key, free } of CASES) {
      const usable = availableSettingOptions(fieldFor(key), []).map((o) => String(o.value));
      expect(usable).toContain(String(DEFAULT_GAME_SETTINGS[key as keyof typeof DEFAULT_GAME_SETTINGS]));
      for (const id of free) expect(usable).toContain(id);
    }
  });

  it('hides what you have not bought and reveals it once you have', () => {
    for (const { key, palettes, free } of CASES) {
      const field = fieldFor(key);
      const locked = Object.keys(palettes).filter((id) => !free.includes(id as never));
      if (locked.length === 0) continue;

      const before = availableSettingOptions(field, []).map((o) => String(o.value));
      for (const id of locked) expect(before).not.toContain(id);

      const after = availableSettingOptions(field, [locked[0]]).map((o) => String(o.value));
      expect(after).toContain(locked[0]);
      for (const id of locked.slice(1)) expect(after).not.toContain(id);
    }
  });

  it('ignores an owned id that is not a cosmetic of this kind', () => {
    for (const { key, free } of CASES) {
      const usable = availableSettingOptions(fieldFor(key), ['gif-abc123', 'pal-lucky-cap']);
      expect(usable.map((o) => String(o.value)).sort()).toEqual([...free].sort());
    }
  });
});
