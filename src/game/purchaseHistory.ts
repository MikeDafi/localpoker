/**
 * Reading the purchase ledger back.
 *
 * Pure, so what the Store shows can be asserted. The awkward part is that the
 * ledger is newer than the game: anyone who was already playing owns things
 * that were never recorded as a sale. Those have to appear, because a history
 * that silently omits half of what you bought is worse than none at all, and
 * they have to be honest about not knowing when or for how much.
 */
import { COSMETIC_CATEGORIES, type CosmeticItem } from './storeCatalog';
import type { CosmeticPurchase, CosmeticsState } from './cosmetics';

export interface PurchaseRecord {
  id: string;
  /** The catalog entry, when the item is still on sale. */
  item?: CosmeticItem;
  /** Shown name, falling back to the raw id for something since withdrawn. */
  name: string;
  /** Undefined when this predates the ledger, so the price is genuinely unknown. */
  price?: number;
  at?: number;
  /**
   * True when the item is owned but has no ledger line, either because it was
   * granted or because it was bought before purchases were recorded.
   */
  unrecorded: boolean;
}

const catalogById = (): Map<string, CosmeticItem> => {
  const map = new Map<string, CosmeticItem>();
  for (const category of COSMETIC_CATEGORIES) {
    for (const item of category.items) map.set(item.id, item);
  }
  return map;
};

/**
 * Newest first, with anything owned but unrecorded listed after everything
 * that has a date, since it cannot be ordered against them.
 */
export function purchaseHistory(state: CosmeticsState): PurchaseRecord[] {
  const catalog = catalogById();
  const ledger: CosmeticPurchase[] = state.purchases ?? [];
  const recordedIds = new Set(ledger.map((entry) => entry.id));

  const recorded: PurchaseRecord[] = ledger.map((entry) => {
    const item = catalog.get(entry.id);
    return {
      id: entry.id,
      item,
      name: item?.name ?? entry.id,
      price: entry.price,
      at: entry.at,
      unrecorded: false,
    };
  });

  const unrecorded: PurchaseRecord[] = (state.ownedCosmeticIds ?? [])
    .filter((id) => !recordedIds.has(id))
    .map((id) => {
      const item = catalog.get(id);
      return { id, item, name: item?.name ?? id, unrecorded: true };
    });

  recorded.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  unrecorded.sort((a, b) => a.name.localeCompare(b.name));
  return [...recorded, ...unrecorded];
}

/** What the ledger can actually account for. Grants are not spending. */
export function totalCoinsSpent(state: CosmeticsState): number {
  return (state.purchases ?? []).reduce(
    (sum, entry) => sum + (Number.isFinite(entry.price) ? Math.max(0, entry.price) : 0),
    0,
  );
}
