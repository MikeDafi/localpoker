/**
 * The contract every store preview honours.
 *
 * A store card shows a thumbnail. Pressing Preview opens the item at the size
 * and in the setting it actually appears in during a hand, because the point
 * of a preview is to answer "what am I buying", and a 62pt swatch cannot.
 *
 * Each category owns one file in this folder and renders itself. They share
 * nothing but this type, which is what lets them be written independently.
 */
import type { CosmeticItem } from '../../game/storeCatalog';

export interface StorePreviewProps {
  /** The item being previewed. Never a category the component does not handle. */
  item: CosmeticItem;
  /**
   * Width available to the preview, in points, already inset from the sheet
   * edges. Previews size themselves from this rather than from the window, so
   * they are correct on every device and inside any container.
   */
  width: number;
}
