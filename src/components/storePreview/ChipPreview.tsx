import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChipStack } from '../ChipStack';
import { CHIP_PALETTES, CLASSIC_CHIPS, type ChipPalette } from '../../game/cosmetics';
import { colors, fonts, radii, shadows, spacing } from '../../theme/theme';
import type { StorePreviewProps } from './types';

const POT_CHIP_SIZE = 26;
const COMPACT_CHIP_SIZE = 22;
const TARGET_WIDTH = 360;

const FULL_STACKS = [
  { key: 'pot', label: 'Pot breakdown', amount: 1600, size: POT_CHIP_SIZE },
  { key: 'bet', label: 'Small bet breakdown', amount: 31, size: COMPACT_CHIP_SIZE },
] as const;

const COMPACT_STACKS = [
  { key: 'small', amount: 31 },
  { key: 'medium', amount: 600 },
  { key: 'large', amount: 8192 },
] as const;

function chipPaletteFor(id: string): ChipPalette {
  const palettes = CHIP_PALETTES as Partial<Record<string, ChipPalette>>;
  return palettes[id] ?? CHIP_PALETTES[CLASSIC_CHIPS];
}

export function ChipPreview({ item, width }: StorePreviewProps) {
  const previewWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  if (previewWidth <= 0) return null;

  const palette = chipPaletteFor(item.id);
  const scale = Math.min(1, Math.max(0.78, previewWidth / TARGET_WIDTH));
  const panelWidth = Math.min(previewWidth, 420);
  const inset = Math.min(spacing.lg, Math.max(spacing.sm, Math.round(previewWidth * 0.045)));
  const rowGap = Math.min(spacing.md, Math.max(spacing.xs, Math.round(previewWidth * 0.03)));
  const fullCardWidth = Math.min(176, Math.max(148, Math.floor((panelWidth - inset * 2 - rowGap) / 2)));
  const potChipSize = Math.round(POT_CHIP_SIZE * scale);
  const compactChipSize = Math.round(COMPACT_CHIP_SIZE * scale);

  return (
    <View
      accessible
      accessibilityLabel={`${item.name} chip preview`}
      accessibilityRole="image"
      style={[styles.wrap, { width: previewWidth }]}
    >
      <View style={[styles.panel, shadows.soft, { width: panelWidth, padding: inset }]}>
        <Text style={styles.sectionLabel}>Full denomination spread</Text>
        <View style={[styles.fullRow, { gap: rowGap }]}>
          {FULL_STACKS.map((stack) => (
            <View key={stack.key} style={[styles.fullCard, { width: fullCardWidth }]}>
              <Text style={styles.cardLabel}>{stack.label}</Text>
              <View style={styles.stackStage}>
                <ChipStack
                  amount={stack.amount}
                  size={stack.size === POT_CHIP_SIZE ? potChipSize : compactChipSize}
                  showLabel={false}
                  palette={palette}
                />
              </View>
              <Text style={styles.amountText}>{stack.amount.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.compactPanel, { marginTop: inset }]}>
          <Text style={styles.sectionLabel}>Compact table stacks</Text>
          <View style={[styles.compactRow, { gap: rowGap }]}>
            {COMPACT_STACKS.map((stack) => (
              <View key={stack.key} style={styles.compactItem}>
                <ChipStack
                  amount={stack.amount}
                  size={compactChipSize}
                  showLabel={false}
                  compact
                  palette={palette}
                />
                <Text style={styles.compactAmount}>{stack.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  panel: {
    borderRadius: radii.lg,
    backgroundColor: colors.felt,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  fullRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  fullCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  cardLabel: {
    marginBottom: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.onDarkSoft,
    textAlign: 'center',
  },
  stackStage: {
    minHeight: 48,
    justifyContent: 'flex-end',
  },
  amountText: {
    marginTop: spacing.sm,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onDark,
  },
  compactPanel: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
  },
  compactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  compactItem: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  compactAmount: {
    marginTop: spacing.xs,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.onDarkSoft,
  },
});
