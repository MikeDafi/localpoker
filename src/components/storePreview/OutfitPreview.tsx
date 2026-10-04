import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_PAL, type PalConfig } from '../../avatar/palConfig';
import { PalAvatar } from '../PalAvatar';
import { applyOutfit } from '../../game/outfits';
import { useApp } from '../../state/AppContext';
import { colors, fonts, radii, shadows, spacing } from '../../theme/theme';
import type { StorePreviewProps } from './types';

const SEAT_AVATAR_SIZE = 42;
const SEAT_RING_SIZE = SEAT_AVATAR_SIZE + 10;

function profilePal(profile: { pal?: PalConfig } | null | undefined): PalConfig {
  return profile?.pal ?? DEFAULT_PAL;
}

export function OutfitPreview({ item, width }: StorePreviewProps) {
  const { profile } = useApp();
  const basePal = profilePal(profile);
  const outfitPal = applyOutfit(basePal, item.id);
  const previewWidth = Math.max(0, width);
  const compareGap = Math.min(spacing.md, Math.round(previewWidth * 0.04));
  const largeCardWidth = Math.max(SEAT_RING_SIZE + spacing.md, Math.floor((previewWidth - compareGap) / 2));
  const largeAvatarSize = Math.min(136, Math.max(SEAT_AVATAR_SIZE, Math.floor(largeCardWidth * 0.72)));
  const tablePanelWidth = Math.min(previewWidth, 340);

  return (
    <View style={[styles.wrap, { width: previewWidth }]}>
      <View style={[styles.compareRow, { gap: compareGap }]}>
        <AvatarCard label="Current" config={basePal} size={largeAvatarSize} width={largeCardWidth} />
        <AvatarCard label="Wearing" config={outfitPal} size={largeAvatarSize} width={largeCardWidth} selected />
      </View>

      <View style={[styles.tablePanel, { width: tablePanelWidth }]}>
        <Text style={styles.sectionLabel}>Table size</Text>
        <View style={styles.tableRow}>
          <SeatSizePal label="Current" config={basePal} />
          <View style={styles.tableDivider} />
          <SeatSizePal label={item.name} config={outfitPal} />
        </View>
      </View>
    </View>
  );
}

function AvatarCard({
  label,
  config,
  size,
  width,
  selected = false,
}: {
  label: string;
  config: PalConfig;
  size: number;
  width: number;
  selected?: boolean;
}) {
  const ringSize = size + 14;

  return (
    <View style={[styles.largeCard, selected && styles.largeCardSelected, { width }]}>
      <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>{label}</Text>
      <View style={[
        styles.largeAvatarRing,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
        },
      ]}>
        <PalAvatar config={config} size={size} />
      </View>
    </View>
  );
}

function SeatSizePal({ label, config }: { label: string; config: PalConfig }) {
  return (
    <View style={styles.seatPreview}>
      <View style={styles.seatRing}>
        <PalAvatar config={config} size={SEAT_AVATAR_SIZE} />
      </View>
      <View style={styles.nameTag}>
        <Text style={styles.nameText} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  largeCard: {
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    ...shadows.soft,
  },
  largeCardSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.surfaceAlt,
  },
  cardLabel: {
    marginBottom: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.onDarkSoft,
  },
  cardLabelSelected: {
    color: colors.gold,
  },
  largeAvatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.surfaceBorderStrong,
    overflow: 'hidden',
  },
  tablePanel: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  tableDivider: {
    width: 1,
    height: 68,
    backgroundColor: colors.surfaceBorder,
  },
  seatPreview: {
    width: 104,
    alignItems: 'center',
  },
  seatRing: {
    width: SEAT_RING_SIZE,
    height: SEAT_RING_SIZE,
    borderRadius: SEAT_RING_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceBorderStrong,
    overflow: 'hidden',
    ...shadows.soft,
  },
  nameTag: {
    marginTop: 3,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 2,
    maxWidth: 96,
  },
  nameText: {
    maxWidth: 84,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.onDark,
  },
});
