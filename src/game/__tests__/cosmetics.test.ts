import { describe, it, expect } from 'vitest';
import {
  CARD_BACK_PALETTES,
  CHIP_PALETTES,
  CLASSIC_CARD_BACK,
  CLASSIC_CHIPS,
  CLASSIC_FELT,
  FELT_PALETTES,
  resolveCardBack,
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

  it('keeps felt palettes limited to cloth colours', () => {
    for (const [id, felt] of Object.entries(FELT_PALETTES)) {
      expect(Object.keys(felt).sort(), id).toEqual(['base', 'deep', 'light']);
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

describe('card backs', () => {
  /*
   * The same bug as the felts, found later and in the same shape: the store
   * sold five card backs and none of them could ever reach the table, because
   * the setting only held the five built-in names.
   */
  it('has a palette for every card back the store sells', () => {
    for (const id of [
      'card-sunrise',
      'card-nebula',
      'card-royal-holo',
      'card-lucky-koi',
      'card-midnight',
    ]) {
      expect(CARD_BACK_PALETTES[id], `no card back palette for ${id}`).toBeDefined();
    }
  });

  it('keeps the five backs the game shipped with', () => {
    for (const id of ['blue', 'red', 'black', 'holo', 'retro']) {
      expect(CARD_BACK_PALETTES[id], `lost built-in back ${id}`).toBeDefined();
    }
  });

  it('gives every back a full set of ink colours and its own glyph', () => {
    const glyphs = new Set<string>();
    for (const [id, p] of Object.entries(CARD_BACK_PALETTES)) {
      expect(p.gradient, `${id} gradient`).toHaveLength(3);
      for (const slot of ['rim', 'panel', 'emblemFill', 'emblemStroke', 'mark', 'line'] as const) {
        expect(p[slot], `${id}.${slot}`).toBeTruthy();
      }
      expect(p.glyph.length, `${id} glyph`).toBeGreaterThan(0);
      glyphs.add(p.glyph);
    }
    // Backs that differ only in hue are hard to tell apart on a small card.
    expect(glyphs.size).toBe(Object.keys(CARD_BACK_PALETTES).length);
  });

  it('falls back to the classic blue for anything unknown', () => {
    expect(resolveCardBack({ setting: 'card-does-not-exist' })).toBe(CLASSIC_CARD_BACK);
    expect(resolveCardBack({})).toBe(CLASSIC_CARD_BACK);
  });

  it('refuses a back that was never bought', () => {
    expect(resolveCardBack({ setting: 'card-midnight', owned: [] })).toBe(CLASSIC_CARD_BACK);
    expect(resolveCardBack({ equippedId: 'card-midnight', owned: [] })).toBe(CLASSIC_CARD_BACK);
  });

  it('uses a bought back, whether pinned or merely equipped', () => {
    const owned = ['card-midnight'];
    expect(resolveCardBack({ setting: 'card-midnight', owned })).toBe('card-midnight');
    expect(resolveCardBack({ equippedId: 'card-midnight', owned })).toBe('card-midnight');
  });

  it('lets the table setting override what is equipped', () => {
    const owned = ['card-midnight', 'card-nebula'];
    expect(
      resolveCardBack({ setting: 'card-nebula', equippedId: 'card-midnight', owned }),
    ).toBe('card-nebula');
  });

  it('pins the back before a room is published, so guests see the host deck', () => {
    // 'equipped' is an instruction to look in a closet. Published raw, every
    // guest would follow it into their own and see a different deck.
    const pinned = pinCosmetics(
      { feltStyle: 'equipped', chipStyle: 'equipped', cardBack: 'equipped' },
      {
        ownedCosmeticIds: ['card-royal-holo'],
        equippedByCategory: { cardBacks: 'card-royal-holo' },
      },
    );
    expect(pinned.cardBack).toBe('card-royal-holo');
  });

  it('pins to the classic blue when the host owns nothing', () => {
    const pinned = pinCosmetics(
      { feltStyle: 'equipped', chipStyle: 'equipped', cardBack: 'equipped' },
      { ownedCosmeticIds: [], equippedByCategory: {} },
    );
    expect(pinned.cardBack).toBe(CLASSIC_CARD_BACK);
  });
  it('uses only glyphs iOS draws as ink, never as colour emoji', () => {
    /*
     * A glyph with an emoji presentation ignores the fill colour entirely.
     * Three of these shipped as emoji on a first pass: a yellow sun and a
     * pink flower sat on top of dark-ink cards like stickers, and a gold
     * crown did the same. They have to be engraved in the card's own ink, so
     * only code points with no emoji presentation are allowed.
     *
     * Checked by code point rather than by eye, because the two look
     * identical in a source file.
     */
    const EMOJI_CAPABLE = [
      [0x2600, 0x27bf], // misc symbols and dingbats, where most of them live
      [0x1f000, 0x1faff],
      [0x2b00, 0x2bff],
    ];
    // Vetted exceptions: these sit inside the ranges above but have no emoji
    // presentation, and were each confirmed on a simulator.
    const TEXT_ONLY = new Set(['\u2660', '\u2665', '\u2663', '\u2666', '\u25C6',
      '\u2726', '\u2739', '\u2756', '\u25C9', '\u2B22']);

    for (const [id, p] of Object.entries(CARD_BACK_PALETTES)) {
      const cp = p.glyph.codePointAt(0)!;
      if (TEXT_ONLY.has(p.glyph)) continue;
      const risky = EMOJI_CAPABLE.some(([lo, hi]) => cp >= lo && cp <= hi);
      expect(risky, `${id} uses ${p.glyph} (U+${cp.toString(16).toUpperCase()}), which may render as emoji`).toBe(false);
    }
  });

  it('never carries a variation selector, which would be a workaround', () => {
    for (const [id, p] of Object.entries(CARD_BACK_PALETTES)) {
      expect(p.glyph.length, `${id} glyph should be a single code point`).toBeLessThanOrEqual(2);
      expect(p.glyph.includes('\uFE0F'), `${id} forces emoji presentation`).toBe(false);
    }
  });
});
