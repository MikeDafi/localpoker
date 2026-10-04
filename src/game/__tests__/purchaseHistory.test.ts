import { describe, expect, it } from 'vitest';
import { purchaseHistory, totalCoinsSpent } from '../purchaseHistory';
import { emptyCosmetics, readCosmetics, type CosmeticsState } from '../cosmetics';
import { COSMETIC_CATEGORIES } from '../storeCatalog';

const anItem = COSMETIC_CATEGORIES.flatMap((c) => c.items)[0];
const anotherItem = COSMETIC_CATEGORIES.flatMap((c) => c.items)[1];

const state = (over: Partial<CosmeticsState>): CosmeticsState => ({ ...emptyCosmetics, ...over });

describe('purchaseHistory', () => {
  it('is empty for a player who has bought nothing', () => {
    expect(purchaseHistory(emptyCosmetics)).toEqual([]);
    expect(totalCoinsSpent(emptyCosmetics)).toBe(0);
  });

  it('lists what was bought, newest first', () => {
    const history = purchaseHistory(state({
      ownedCosmeticIds: [anItem.id, anotherItem.id],
      purchases: [
        { id: anItem.id, price: 100, at: 1000 },
        { id: anotherItem.id, price: 250, at: 5000 },
      ],
    }));
    expect(history.map((h) => h.id)).toEqual([anotherItem.id, anItem.id]);
    expect(history[0].price).toBe(250);
    expect(history[0].name).toBe(anotherItem.name);
  });

  /*
   * The ledger is newer than the game. Anyone already playing owns things
   * that were never recorded, and a history that silently omits half of what
   * you bought is worse than no history.
   */
  it('still shows what was owned before the ledger existed', () => {
    const history = purchaseHistory(state({ ownedCosmeticIds: [anItem.id], purchases: [] }));
    expect(history).toHaveLength(1);
    expect(history[0].unrecorded).toBe(true);
    expect(history[0].price).toBeUndefined();
    expect(history[0].at).toBeUndefined();
  });

  it('does not list an item twice when it is both owned and recorded', () => {
    const history = purchaseHistory(state({
      ownedCosmeticIds: [anItem.id],
      purchases: [{ id: anItem.id, price: 100, at: 1 }],
    }));
    expect(history).toHaveLength(1);
    expect(history[0].unrecorded).toBe(false);
  });

  it('survives an item that has since left the catalog', () => {
    const history = purchaseHistory(state({
      ownedCosmeticIds: ['withdrawn-thing'],
      purchases: [{ id: 'withdrawn-thing', price: 42, at: 10 }],
    }));
    expect(history[0].name).toBe('withdrawn-thing');
    expect(history[0].item).toBeUndefined();
    expect(history[0].price).toBe(42);
  });

  it('counts only real spending, since grants are not purchases', () => {
    const spent = totalCoinsSpent(state({
      ownedCosmeticIds: [anItem.id, anotherItem.id],
      purchases: [{ id: anItem.id, price: 100, at: 1 }],
    }));
    expect(spent).toBe(100);
  });
});

describe('reading a stored ledger', () => {
  it('round trips', () => {
    const raw = JSON.stringify({
      ownedCosmeticIds: [anItem.id],
      equippedByCategory: {},
      purchases: [{ id: anItem.id, price: 300, at: 1234 }],
    });
    expect(readCosmetics(raw).purchases).toEqual([{ id: anItem.id, price: 300, at: 1234 }]);
  });

  it('defaults to an empty ledger for a save that predates it', () => {
    const raw = JSON.stringify({ ownedCosmeticIds: [anItem.id], equippedByCategory: {} });
    expect(readCosmetics(raw).purchases).toEqual([]);
  });

  /*
   * This is storage, so it is attacker-adjacent: a corrupted or hand-edited
   * file must not put NaN prices or junk rows into the receipt list.
   */
  it('throws out junk rows rather than trusting the file', () => {
    const raw = JSON.stringify({
      ownedCosmeticIds: [],
      equippedByCategory: {},
      purchases: [
        null,
        'nope',
        { id: 123, price: 10 },
        { id: 'ok', price: 'free' },
        { id: 'good', price: 50.7, at: 'soon' },
        { id: 'negative', price: -10, at: 5 },
      ],
    });
    expect(readCosmetics(raw).purchases).toEqual([
      { id: 'good', price: 50 },
      { id: 'negative', price: 0, at: 5 },
    ]);
  });
});
