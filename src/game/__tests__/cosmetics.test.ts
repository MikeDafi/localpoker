import { describe, it, expect } from 'vitest';
import {
  CHIP_PALETTES,
  CLASSIC_CHIPS,
  CLASSIC_FELT,
  FELT_PALETTES,
  resolveChips,
  resolveFelt,
  pinCosmetics,
} from '../cosmetics';

describe('cosmetic palettes', () => {
  /*
   * The bug this file exists to fix: the store sold tables and chip styles
   * and equipping one changed nothing. An item on sale with no palette would
   * be exactly that bug again, so the catalogue and the palettes are checked
   * against each other.
   */
  it('has a felt for every table the store sells', () => {
    for (const id of ['table-emerald', 'table-miami', 'table-velvet', 'table-sakura', 'table-lunar']) {
      expect(FELT_PALETTES[id], `no felt palette for ${id}`).toBeDefined();
    }
  });

  it('has chips for every chip style the store sells', () => {
    for (const id of ['chips-candy', 'chips-obsidian', 'chips-circuit', 'chips-diamond', 'chips-golden-tiki']) {
      expect(CHIP_PALETTES[id], `no chip palette for ${id}`).toBeDefined();
    }
  });

  it('gives every colour as a real hex, so nothing renders transparent', () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (const [id, felt] of Object.entries(FELT_PALETTES)) {
      for (const [slot, value] of Object.entries(felt)) {
        expect(hex.test(value), `${id}.${slot} is ${value}`).toBe(true);
      }
    }
    for (const [id, chips] of Object.entries(CHIP_PALETTES)) {
      for (const [slot, pair] of Object.entries(chips)) {
        for (const value of pair) expect(hex.test(value), `${id}.${slot} is ${value}`).toBe(true);
      }
    }
  });
});

describe('resolveFelt', () => {
  const owned = ['table-miami'];

  it('uses the classic felt when nothing is chosen', () => {
    expect(resolveFelt({})).toEqual(FELT_PALETTES[CLASSIC_FELT]);
  });

  it('follows the store when the game is set to follow it', () => {
    expect(resolveFelt({ setting: 'equipped', equippedId: 'table-miami', owned }))
      .toEqual(FELT_PALETTES['table-miami']);
  });

  /*
   * A felt belongs to the table rather than to the person looking at it, so
   * the game's own setting beats whatever the player happens to have equipped.
   */
  it('lets the game override what is equipped', () => {
    expect(resolveFelt({ setting: 'table-miami', equippedId: 'table-lunar', owned }))
      .toEqual(FELT_PALETTES['table-miami']);
  });

  it('refuses a felt that was never bought', () => {
    expect(resolveFelt({ setting: 'table-lunar', owned })).toEqual(FELT_PALETTES[CLASSIC_FELT]);
    expect(resolveFelt({ setting: 'equipped', equippedId: 'table-lunar', owned }))
      .toEqual(FELT_PALETTES[CLASSIC_FELT]);
  });

  /*
   * A saved game or a room from a build with a felt this one does not have
   * must still open. A cosmetic is not worth an error.
   */
  it('falls back rather than failing on a felt it has never heard of', () => {
    expect(resolveFelt({ setting: 'table-from-the-future', owned })).toEqual(FELT_PALETTES[CLASSIC_FELT]);
  });

  it('always allows the classic felt, which nobody has to buy', () => {
    expect(resolveFelt({ setting: CLASSIC_FELT, owned: [] })).toEqual(FELT_PALETTES[CLASSIC_FELT]);
  });
});

describe('resolveChips', () => {
  it('uses the classic chips by default', () => {
    expect(resolveChips({})).toEqual(CHIP_PALETTES[CLASSIC_CHIPS]);
  });

  it('follows an equipped and owned chip set', () => {
    expect(resolveChips({ setting: 'equipped', equippedId: 'chips-candy', owned: ['chips-candy'] }))
      .toEqual(CHIP_PALETTES['chips-candy']);
  });

  it('refuses chips that were never bought', () => {
    expect(resolveChips({ setting: 'chips-obsidian', owned: [] })).toEqual(CHIP_PALETTES[CLASSIC_CHIPS]);
  });
});

describe('pinCosmetics', () => {
  const closet = { ownedCosmeticIds: ['table-miami', 'chips-candy'], equippedByCategory: { tables: 'table-miami', chips: 'chips-candy' } };

  /*
   * The point: 'equipped' is not a felt, it is an instruction to look in a
   * closet. Published as-is, every guest follows it into their own closet and
   * the table is a different colour for everyone sitting at it.
   */
  it('turns equipped into the actual felt before it travels', () => {
    const pinned = pinCosmetics({ feltStyle: 'equipped', chipStyle: 'equipped' }, closet);
    expect(pinned.feltStyle).toBe('table-miami');
    expect(pinned.chipStyle).toBe('chips-candy');
  });

  it('leaves a felt the host already named alone', () => {
    const pinned = pinCosmetics({ feltStyle: 'table-miami', chipStyle: 'classic' }, closet);
    expect(pinned.feltStyle).toBe('table-miami');
    expect(pinned.chipStyle).toBe('classic');
  });

  it('publishes the classic felt when the host owns nothing', () => {
    const pinned = pinCosmetics({ feltStyle: 'equipped', chipStyle: 'equipped' }, { ownedCosmeticIds: [], equippedByCategory: {} });
    expect(pinned.feltStyle).toBe('classic');
    expect(pinned.chipStyle).toBe('classic');
  });

  it('never publishes the word equipped, whatever it is handed', () => {
    for (const closetState of [closet, { ownedCosmeticIds: [], equippedByCategory: {} }]) {
      const pinned = pinCosmetics({ feltStyle: 'equipped', chipStyle: 'equipped' }, closetState);
      expect(pinned.feltStyle).not.toBe('equipped');
      expect(pinned.chipStyle).not.toBe('equipped');
    }
  });

  it('keeps the rest of the settings untouched', () => {
    const pinned = pinCosmetics({ feltStyle: 'equipped', chipStyle: 'equipped', bigBlind: 50 } as never, closet) as { bigBlind: number };
    expect(pinned.bigBlind).toBe(50);
  });
});
