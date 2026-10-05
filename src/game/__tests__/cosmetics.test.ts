import { describe, it, expect } from 'vitest';
import {
  CARD_BACK_PALETTES,
  CHIP_PALETTES,
  CLASSIC_CARD_BACK,
  CLASSIC_CHIPS,
  CLASSIC_FELT,
  EMOJI_EMOTES,
  EMOTE_COSMETICS,
  FELT_PALETTES,
  FREE_EMOJI_COSMETIC_IDS,
  FREE_EMOTE_COSMETIC_IDS,
  FREE_GIF_COSMETIC_IDS,
  FREE_REACTION_COSMETIC_IDS,
  FREE_STICKER_COSMETIC_IDS,
  FREE_TEXT_COSMETIC_IDS,
  GIF_EMOTES,
  LEGACY_EMOJI_GRANT_IDS,
  PAL_MOTIONS,
  PURCHASABLE_EMOJI_EMOTES,
  PURCHASABLE_GIF_EMOTES,
  PURCHASABLE_STICKER_EMOTES,
  PURCHASABLE_TEXT_EMOTES,
  STARTER_CARD_BACKS,
  STICKER_EMOTES,
  TEXT_EMOTES,
  canSendEmotePayload,
  emoteCosmeticIdForPayload,
  gifCosmeticId,
  isFreeOrOwnedCosmetic,
  migrateCosmetics,
  pinCosmetics,
  resolveCardBack,
  resolveChips,
  resolveEmojiEmoteOptions,
  resolveEmojiEmotes,
  resolveFelt,
  resolveGifEmoteOptions,
  resolveGifEmotes,
  resolvePalMotionOptions,
  resolveStickerEmoteOptions,
  resolveTextEmoteOptions,
  unlockedFirst,
} from '../cosmetics';
import { GIF_LIBRARY, gifUrl } from '../../services/gifs';

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
      'black',
      'retro',
      'holo',
      'card-sunrise',
      'card-nebula',
      'card-royal-holo',
      'card-lucky-koi',
      'card-midnight',
    ]) {
      expect(CARD_BACK_PALETTES[id], `no card back palette for ${id}`).toBeDefined();
    }
  });

  it('keeps the two backs a new player starts with', () => {
    expect([...STARTER_CARD_BACKS]).toEqual(['blue', 'red']);
    for (const id of STARTER_CARD_BACKS) {
      expect(CARD_BACK_PALETTES[id], `lost starter back ${id}`).toBeDefined();
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
    expect(resolveCardBack({ setting: 'black', owned: [] })).toBe(CLASSIC_CARD_BACK);
    expect(resolveCardBack({ setting: 'card-midnight', owned: [] })).toBe(CLASSIC_CARD_BACK);
    expect(resolveCardBack({ equippedId: 'card-midnight', owned: [] })).toBe(CLASSIC_CARD_BACK);
  });

  it('always allows the two starter backs', () => {
    expect(resolveCardBack({ setting: 'blue', owned: [] })).toBe('blue');
    expect(resolveCardBack({ setting: 'red', owned: [] })).toBe('red');
  });

  it('uses a bought back, whether pinned or merely equipped', () => {
    const owned = ['black', 'card-midnight'];
    expect(resolveCardBack({ setting: 'black', owned })).toBe('black');
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

describe('gif emotes', () => {
  it('keeps one fifth free and sells the rest', () => {
    expect(GIF_LIBRARY.length).toBeGreaterThanOrEqual(70);
    expect(FREE_GIF_COSMETIC_IDS).toHaveLength(16);
    expect(Object.keys(PURCHASABLE_GIF_EMOTES)).toHaveLength(GIF_LIBRARY.length - FREE_GIF_COSMETIC_IDS.length);
    const soldShare = Object.keys(PURCHASABLE_GIF_EMOTES).length / GIF_LIBRARY.length;
    expect(soldShare).toBeGreaterThan(0.78);
    expect(soldShare).toBeLessThan(0.82);
  });

  it('has cosmetic data for every GIF in the library', () => {
    expect(Object.keys(GIF_EMOTES)).toHaveLength(GIF_LIBRARY.length);
    for (const gif of GIF_LIBRARY) {
      expect(GIF_EMOTES[gifCosmeticId(gif.id)], `missing cosmetic data for ${gif.id}`).toBeDefined();
    }
  });

  it('starts with the everyday free set only', () => {
    const available = resolveGifEmotes({ owned: [] });
    expect(available.map((gif) => gif.id)).toEqual(FREE_GIF_COSMETIC_IDS);
  });

  it('adds bought GIFs without exposing unowned ones', () => {
    const bought = Object.keys(PURCHASABLE_GIF_EMOTES).slice(0, 2);
    const available = resolveGifEmotes({ owned: bought });
    const ids = available.map((gif) => gif.id);
    for (const id of bought) expect(ids).toContain(id);
    for (const id of Object.keys(PURCHASABLE_GIF_EMOTES).slice(2)) {
      expect(ids, `${id} is unowned`).not.toContain(id);
    }
  });

  it('never drops an owned GIF from the available tray', () => {
    const available = resolveGifEmotes({ owned: Object.keys(PURCHASABLE_GIF_EMOTES) });
    expect(available.map((gif) => gif.gifId)).toEqual(GIF_LIBRARY.map((gif) => gif.id));
  });
});

describe('emoji emotes', () => {
  it('keeps ordinary table talk free and sells novelty reactions', () => {
    expect(resolveEmojiEmotes({ owned: [] })).toEqual(['👍', '🍀', '🤝']);
    expect(Object.values(PURCHASABLE_EMOJI_EMOTES).map((emoji) => emoji.emoji)).toEqual([
      '😂',
      '😤',
      '🤔',
      '😅',
      '😮',
      '😎',
      '🔥',
      '🎉',
      '🙌',
      '😱',
      '🤯',
      '💪',
      '😴',
    ]);
  });

  it('adds bought emoji without exposing unowned ones', () => {
    const available = resolveEmojiEmotes({ owned: ['emoji-fire', 'emoji-mind-blown'] });
    expect(available).toContain('🔥');
    expect(available).toContain('🤯');
    expect(available).not.toContain('😎');
  });

  it('has store data for every emoji reaction', () => {
    expect(Object.keys(EMOJI_EMOTES)).toHaveLength(16);
    for (const emoji of Object.values(EMOJI_EMOTES)) {
      expect(emoji.swatches).toHaveLength(3);
      expect(emoji.description.length).toBeGreaterThan(0);
    }
  });

  it('grants newly paid emoji to existing players exactly once', () => {
    const migrated = migrateCosmetics(
      { ownedCosmeticIds: ['card-midnight'], equippedByCategory: {} },
      { grantLegacyEmojiEmotes: true },
    );
    for (const id of LEGACY_EMOJI_GRANT_IDS) {
      expect(migrated.ownedCosmeticIds).toContain(id);
    }

    const repeated = migrateCosmetics(migrated, { grantLegacyEmojiEmotes: true });
    expect(repeated).toBe(migrated);
  });

  it('marks new players migrated without giving them paid emoji', () => {
    const migrated = migrateCosmetics(
      { ownedCosmeticIds: [], equippedByCategory: {} },
      { grantLegacyEmojiEmotes: false },
    );
    for (const id of LEGACY_EMOJI_GRANT_IDS) {
      expect(migrated.ownedCosmeticIds).not.toContain(id);
    }
    expect(migrated.appliedMigrations?.length).toBeGreaterThan(0);
  });
});

describe('reaction emote ownership', () => {
  it('keeps about one fifth of the whole emote catalogue free', () => {
    const total =
      Object.keys(GIF_EMOTES).length
      + Object.keys(EMOJI_EMOTES).length
      + Object.keys(STICKER_EMOTES).length
      + Object.keys(TEXT_EMOTES).length
      + Object.keys(PAL_MOTIONS).length;
    const free = FREE_REACTION_COSMETIC_IDS.length;

    expect(total).toBe(121);
    expect(free).toBe(24);
    expect(free / total).toBeGreaterThan(0.19);
    expect(free / total).toBeLessThan(0.21);
    expect(FREE_EMOTE_COSMETIC_IDS).toEqual([
      ...FREE_EMOJI_COSMETIC_IDS,
      ...FREE_STICKER_COSMETIC_IDS,
      ...FREE_TEXT_COSMETIC_IDS,
    ]);
  });

  it('puts paid sticker and text emotes in the same cosmetic catalogue as emoji', () => {
    expect(Object.keys(EMOTE_COSMETICS)).toHaveLength(
      Object.keys(EMOJI_EMOTES).length
      + Object.keys(STICKER_EMOTES).length
      + Object.keys(TEXT_EMOTES).length,
    );
    expect(Object.keys(PURCHASABLE_STICKER_EMOTES)).toHaveLength(6);
    expect(Object.keys(PURCHASABLE_TEXT_EMOTES)).toHaveLength(6);
    expect(Object.values(PURCHASABLE_TEXT_EMOTES).map((entry) => entry.text)).toEqual([
      'All in!',
      'Bluffing?',
      "Let's go!",
      'Fold!',
      'Wow!',
      'Unlucky',
    ]);
  });

  it('marks locked and owned options without hiding store inventory', () => {
    expect(isFreeOrOwnedCosmetic('emoji-thumbsup', [])).toBe(true);
    expect(isFreeOrOwnedCosmetic('emoji-fire', [])).toBe(false);
    expect(isFreeOrOwnedCosmetic('emoji-fire', ['emoji-fire'])).toBe(true);

    const owned = ['emoji-fire', 'sticker-rocket', 'text-all-in', 'pal-motion-cry'];
    expect(resolveEmojiEmoteOptions({ owned })).toHaveLength(Object.keys(EMOJI_EMOTES).length);
    expect(resolveEmojiEmoteOptions({ owned }).find((entry) => entry.id === 'emoji-fire')?.locked).toBe(false);
    expect(resolveEmojiEmoteOptions({ owned }).find((entry) => entry.id === 'emoji-laugh')?.locked).toBe(true);
    expect(resolveStickerEmoteOptions({ owned }).find((entry) => entry.id === 'sticker-rocket')?.locked).toBe(false);
    expect(resolveTextEmoteOptions({ owned }).find((entry) => entry.id === 'text-all-in')?.locked).toBe(false);
    expect(resolvePalMotionOptions({ owned }).find((entry) => entry.id === 'pal-motion-cry')?.locked).toBe(false);

    const paidGif = Object.values(PURCHASABLE_GIF_EMOTES)[0]!;
    const otherPaidGifId = Object.keys(PURCHASABLE_GIF_EMOTES).find((id) => id !== paidGif.id)!;
    const gifOptions = resolveGifEmoteOptions({ owned: [paidGif.id] });
    expect(gifOptions).toHaveLength(Object.keys(GIF_EMOTES).length);
    expect(gifOptions.find((entry) => entry.id === paidGif.id)?.locked).toBe(false);
    expect(gifOptions.find((entry) => entry.id === otherPaidGifId)?.locked).toBe(true);
  });

  it('maps payloads to cosmetic ids before sending', () => {
    expect(emoteCosmeticIdForPayload({ type: 'emoji', value: '🔥' })).toBe('emoji-fire');
    expect(emoteCosmeticIdForPayload({ type: 'sticker', value: '🚀', anim: 'bounce' })).toBe('sticker-rocket');
    expect(emoteCosmeticIdForPayload({ type: 'text', value: '  All in!  ' })).toBe('text-all-in');
    const paidGif = Object.values(PURCHASABLE_GIF_EMOTES)[0]!;
    expect(emoteCosmeticIdForPayload({ type: 'gif', value: gifUrl(paidGif.gifId) })).toBe(paidGif.id);
    expect(emoteCosmeticIdForPayload({ type: 'palMotion', value: 'cry' })).toBe('pal-motion-cry');
  });

  it('refuses locked catalogue emotes until the matching cosmetic is owned', () => {
    const paidGif = Object.values(PURCHASABLE_GIF_EMOTES)[0]!;
    const locked = [
      { type: 'emoji', value: '🔥' },
      { type: 'sticker', value: '🚀', anim: 'bounce' },
      { type: 'text', value: 'All in!' },
      { type: 'gif', value: gifUrl(paidGif.gifId) },
      { type: 'palMotion', value: 'cry' },
    ] as const;

    for (const payload of locked) {
      expect(canSendEmotePayload(payload, []), JSON.stringify(payload)).toBe(false);
    }

    expect(canSendEmotePayload({ type: 'emoji', value: '🔥' }, ['emoji-fire'])).toBe(true);
    expect(canSendEmotePayload({ type: 'sticker', value: '🚀', anim: 'bounce' }, ['sticker-rocket'])).toBe(true);
    expect(canSendEmotePayload({ type: 'text', value: 'All in!' }, ['text-all-in'])).toBe(true);
    expect(canSendEmotePayload({ type: 'gif', value: gifUrl(paidGif.gifId) }, [paidGif.id])).toBe(true);
    expect(canSendEmotePayload({ type: 'palMotion', value: 'cry' }, ['pal-motion-cry'])).toBe(true);
  });

  it('allows free catalogue emotes and custom typed text', () => {
    expect(canSendEmotePayload({ type: 'emoji', value: '👍' }, [])).toBe(true);
    expect(canSendEmotePayload({ type: 'sticker', value: '🃏', anim: 'spin' }, [])).toBe(true);
    expect(canSendEmotePayload({ type: 'text', value: 'GG' }, [])).toBe(true);
    expect(canSendEmotePayload({ type: 'gif', value: gifUrl(GIF_EMOTES[FREE_GIF_COSMETIC_IDS[0]!]!.gifId) }, [])).toBe(true);
    expect(canSendEmotePayload({ type: 'palMotion', value: 'wave' }, [])).toBe(true);
    expect(canSendEmotePayload({ type: 'text', value: 'Good luck everyone' }, [])).toBe(true);
  });
});

/*
 * A picker that interleaves owned and locked items makes the player hunt for
 * the ones that actually work, and the locked ones draw the eye because they
 * carry a badge. Everything sendable goes first.
 */
describe('unlockedFirst', () => {
  it('puts everything unlocked before everything locked', () => {
    const items = [
      { id: 'a', locked: true },
      { id: 'b', locked: false },
      { id: 'c', locked: true },
      { id: 'd', locked: false },
    ];
    expect(unlockedFirst(items).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps the catalogue order inside each group', () => {
    const items = [
      { id: 'x1', locked: false },
      { id: 'y1', locked: true },
      { id: 'x2', locked: false },
      { id: 'y2', locked: true },
      { id: 'x3', locked: false },
    ];
    const out = unlockedFirst(items).map((i) => i.id);
    expect(out).toEqual(['x1', 'x2', 'x3', 'y1', 'y2']);
  });

  it('is a no-op when nothing is locked, and when everything is', () => {
    const open = [{ id: 'a', locked: false }, { id: 'b', locked: false }];
    const shut = [{ id: 'a', locked: true }, { id: 'b', locked: true }];
    expect(unlockedFirst(open)).toEqual(open);
    expect(unlockedFirst(shut)).toEqual(shut);
    expect(unlockedFirst([])).toEqual([]);
  });

  it('is what every emote picker actually returns', () => {
    for (const options of [
      resolveEmojiEmoteOptions({ owned: [] }),
      resolveStickerEmoteOptions({ owned: [] }),
      resolveTextEmoteOptions({ owned: [] }),
      resolvePalMotionOptions({ owned: [] }),
    ]) {
      const firstLocked = options.findIndex((o) => o.locked);
      if (firstLocked === -1) continue;
      // Nothing unlocked may appear after the first locked entry.
      expect(options.slice(firstLocked).every((o) => o.locked)).toBe(true);
    }
  });
});
