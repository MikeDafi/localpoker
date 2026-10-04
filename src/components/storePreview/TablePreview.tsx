import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DealtCard } from '../DealtCard';
import { FeltSurface } from '../FeltSurface';
import { FELT_PALETTES } from '../../game/cosmetics';
import type { Suit } from '../../game/cardFace';
import { colors, fonts, radii, shadows, spacing } from '../../theme/theme';
import type { StorePreviewProps } from './types';

const BASE_TABLE_WIDTH = 390;
const TABLE_RATIO = 0.64;
const FELT_INSET = 4;
const FELT_RAIL = 10;
const FELT_INNER_SHADOW = 14;
const CARD_RATIO = 1.42;

type PreviewCard = {
  rank: number;
  suit: Suit;
};

const PREVIEW_BOARD: readonly (PreviewCard | null)[] = [
  { rank: 14, suit: 's' },
  { rank: 13, suit: 'h' },
  { rank: 10, suit: 'd' },
  null,
  null,
];

export function TablePreview({ item, width }: StorePreviewProps) {
  const tableWidth = Math.max(0, width);
  const tableHeight = tableWidth * TABLE_RATIO;
  const scale = tableWidth / BASE_TABLE_WIDTH;
  const feltInset = FELT_INSET * scale;
  const feltRail = FELT_RAIL * scale;
  const clothWidth = Math.max(0, tableWidth - 2 * (feltInset + feltRail));
  const clothHeight = Math.max(0, tableHeight - 2 * (feltInset + feltRail));
  const glowSize = 300 * scale;
  const cardSize = Math.max(18 * scale, Math.min(44 * scale, clothWidth / 6.8));
  const cardHeight = cardSize * CARD_RATIO;
  const palette = FELT_PALETTES[item.id];
  const gradientColors = [palette.light, palette.base, palette.deep] as const;

  if (tableWidth <= 0) return null;

  return (
    <View
      style={styles.root}
      accessibilityLabel={`${item.name} table felt preview`}
      accessibilityRole="image"
    >
      <View style={[styles.tableArea, { width: tableWidth, height: tableHeight }]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.feltOval,
            shadows.raised,
            {
              top: feltInset,
              left: feltInset,
              right: feltInset,
              bottom: feltInset,
              borderRadius: tableHeight / 2,
              borderWidth: feltRail,
            },
          ]}
          pointerEvents="none"
        >
          <FeltSurface width={clothWidth} height={clothHeight} />
          <View
            style={[
              styles.railHighlight,
              {
                borderTopLeftRadius: tableHeight / 2,
                borderTopRightRadius: tableHeight / 2,
              },
            ]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.feltInner,
              {
                borderRadius: tableHeight / 2,
                borderWidth: FELT_INNER_SHADOW * scale,
              },
            ]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.feltGlow,
              {
                width: glowSize,
                height: glowSize,
                borderRadius: glowSize / 2,
              },
            ]}
            pointerEvents="none"
          />
        </LinearGradient>

        <View style={styles.centerZone} pointerEvents="none">
          <View style={styles.board}>
            {PREVIEW_BOARD.map((card, index) => (
              <View key={`slot-${index}`} style={styles.boardCardWrap}>
                {card ? (
                  <DealtCard
                    rank={card.rank}
                    suit={card.suit}
                    size={cardSize}
                    faceUp
                    noFlip
                    animate={false}
                  />
                ) : (
                  <View style={[styles.cardSlot, { width: cardSize, height: cardHeight }]} />
                )}
              </View>
            ))}
          </View>

          <View style={styles.potWrap}>
            <View style={styles.potCenter}>
              <Text style={styles.potCenterLabel}>Pot</Text>
              <Text style={styles.potCenterValue}>1,240</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  tableArea: {
    position: 'relative',
  },
  feltOval: {
    position: 'absolute',
    borderColor: colors.feltRail,
    overflow: 'hidden',
  },
  railHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
    backgroundColor: colors.feltRailEdge,
    opacity: 0.35,
  },
  feltInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderColor: colors.feltInnerShadow,
    opacity: 0.55,
  },
  feltGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: '18%',
    backgroundColor: colors.feltLight,
    opacity: 0.22,
  },
  centerZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  board: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boardCardWrap: {
    marginHorizontal: 0,
    borderRadius: radii.sm + 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSlot: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  potWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  potCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  potCenterLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  potCenterValue: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.onDark,
  },
});
