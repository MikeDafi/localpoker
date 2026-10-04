import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { colors, fonts, spacing } from '../../theme/theme';
import { CardBackPreview } from './CardBackPreview';
import { ChipPreview } from './ChipPreview';
import { EmotePreview } from './EmotePreview';
import { GifPreview } from './GifPreview';
import { OutfitPreview } from './OutfitPreview';
import { PalMotionPreview } from './PalMotionPreview';
import { TablePreview } from './TablePreview';
import type { StorePreviewProps } from './types';

export type { StorePreviewProps } from './types';

/**
 * Dispatches an item to the preview that knows how to draw it.
 *
 * Deliberately a switch rather than a lookup keyed by category id: a new
 * category added to `CATEGORY_IDS` without a preview is then a type error
 * here instead of a blank sheet at runtime.
 */
export function StorePreview({ item, width }: StorePreviewProps) {
  switch (item.category) {
    case 'gifs':
      return <GifPreview item={item} width={width} />;
    case 'emotes':
      return <EmotePreview item={item} width={width} />;
    case 'palMotions':
      return <PalMotionPreview item={item} width={width} />;
    case 'cardBacks':
      return <CardBackPreview item={item} width={width} />;
    case 'tables':
      return <TablePreview item={item} width={width} />;
    case 'chips':
      return <ChipPreview item={item} width={width} />;
    case 'outfits':
      return <OutfitPreview item={item} width={width} />;
    default:
      return <MissingPreview />;
  }
}

/**
 * Only reachable if a category is added without a preview, which the switch
 * above makes a compile error. It exists so that mistake degrades to a line of
 * text rather than an empty sheet with a Buy button under it.
 */
function MissingPreview() {
  return (
    <View style={styles.missing}>
      <Text style={styles.missingText}>No preview for this item yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { paddingVertical: spacing.xl, alignItems: 'center' },
  missingText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted },
});
