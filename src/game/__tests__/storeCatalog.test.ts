import { describe, expect, it } from 'vitest';
import { COSMETIC_CATEGORIES, type CosmeticItem } from '../storeCatalog';
import {
  CARD_BACK_PALETTES,
  CHIP_PALETTES,
  EMOTE_COSMETICS,
  FELT_PALETTES,
  FREE_EMOTE_COSMETIC_IDS,
  FREE_GIF_COSMETIC_IDS,
  FREE_PAL_MOTION_COSMETIC_IDS,
  GIF_EMOTES,
  PAL_MOTIONS,
  STARTER_CARD_BACKS,
  STARTER_CHIPS,
  STARTER_FELTS,
} from '../cosmetics';

const itemsIn = (category: string): CosmeticItem[] =>
  COSMETIC_CATEGORIES.find((c) => c.id === category)?.items ?? [];

/*
 * The store has twice sold something that did nothing: first tables and chip
 * sets, then card backs. Both times the item existed and the palette did not,
 * so the purchase was recorded, the tick appeared, and the table looked
 * exactly the same.
 *
 * These lock the two lists to each other in both directions, which is the
 * only way a new item cannot repeat it.
 */
describe('everything on sale actually does something', () => {
  const cases: [string, Record<string, unknown>, readonly string[]][] = [
    ['cardBacks', CARD_BACK_PALETTES, STARTER_CARD_BACKS],
    ['tables', FELT_PALETTES, STARTER_FELTS],
    ['chips', CHIP_PALETTES, STARTER_CHIPS],
    ['emotes', EMOTE_COSMETICS, FREE_EMOTE_COSMETIC_IDS],
    ['gifs', GIF_EMOTES, FREE_GIF_COSMETIC_IDS],
    ['palMotions', PAL_MOTIONS, FREE_PAL_MOTION_COSMETIC_IDS],
  ];

  for (const [category, palettes, builtInIds] of cases) {
    it(`gives every ${category} item a palette`, () => {
      const items = itemsIn(category);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(palettes[item.id], `${item.name} (${item.id}) is on sale with no palette`).toBeDefined();
      }
    });

    it(`puts every ${category} palette on sale, or marks it a built-in`, () => {
      // A palette nobody can buy and nobody starts with is dead weight: it
      // cannot be reached from the store or from settings.
      const forSale = new Set(itemsIn(category).map((i) => i.id));
      const builtIn = new Set(builtInIds);
      for (const id of Object.keys(palettes)) {
        expect(
          forSale.has(id) || builtIn.has(id),
          `${id} has a palette but is neither sold nor a built-in`,
        ).toBe(true);
      }
    });
  }
});

describe('store catalogue hygiene', () => {
  it('never sells the same id twice', () => {
    const ids = COSMETIC_CATEGORIES.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('files every item under the category it is listed in', () => {
    for (const category of COSMETIC_CATEGORIES) {
      for (const item of category.items) {
        expect(item.category, `${item.id} is listed under ${category.id}`).toBe(category.id);
      }
    }
  });

  it('prices everything as a positive round number of coins', () => {
    for (const category of COSMETIC_CATEGORIES) {
      for (const item of category.items) {
        expect(Number.isInteger(item.price), `${item.id} price`).toBe(true);
        expect(item.price, `${item.id} price`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every item the three swatches its preview draws', () => {
    for (const category of COSMETIC_CATEGORIES) {
      for (const item of category.items) {
        expect(item.swatches, `${item.id} swatches`).toHaveLength(3);
      }
    }
  });
});
