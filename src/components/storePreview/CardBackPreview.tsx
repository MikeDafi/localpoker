import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CardBack } from '../CardBack';
import { FeltSurface } from '../FeltSurface';
import { colors, fonts, radii, shadows, spacing } from '../../theme/theme';
import type { StorePreviewProps } from './types';

const CARD_ASPECT = 1.42;
const WIDE_TABLE_WIDTH = 380;
const HERO_CARD_NARROW = 76;
const HERO_CARD_WIDE = 86;
const HERO_CARD_GAP = 10;
const OPPONENT_CARD_SIZE = 18;
const OPPONENT_CARD_OVERLAP = OPPONENT_CARD_SIZE * 0.6;
const LABEL_HEIGHT = 16;

export function CardBackPreview({ item, width }: StorePreviewProps) {
  const previewWidth = Math.max(0, width);
  if (previewWidth <= 0) return null;

  const heroCardSize = previewWidth < WIDE_TABLE_WIDTH ? HERO_CARD_NARROW : HERO_CARD_WIDE;
  const heroCardHeight = heroCardSize * CARD_ASPECT;
  const opponentCardHeight = OPPONENT_CARD_SIZE * CARD_ASPECT;
  const inset = Math.min(spacing.xl, Math.max(spacing.md, previewWidth * 0.055));
  const sectionGap = Math.min(spacing.xl, Math.max(spacing.md, previewWidth * 0.045));
  const labelGap = spacing.sm;
  const previewHeight = Math.ceil(
    inset * 2 + LABEL_HEIGHT * 2 + labelGap * 2 + heroCardHeight + sectionGap + opponentCardHeight,
  );

  return (
    <View
      style={[styles.preview, { width: previewWidth, height: previewHeight }]}
      accessibilityLabel={`${item.name} card back preview`}
    >
      <LinearGradient
        colors={[colors.feltLight, colors.felt, colors.feltDeep]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.fill}
      />
      <FeltSurface width={previewWidth} height={previewHeight} />
      <View style={[styles.content, { padding: inset }]}>
        <View style={styles.section}>
          <Text style={styles.label}>Your hand</Text>
          <View style={[styles.heroCards, { marginTop: labelGap }]}>
            <CardBackFrame size={heroCardSize} variant={item.id} />
            <View style={{ marginLeft: HERO_CARD_GAP }}>
              <CardBackFrame size={heroCardSize} variant={item.id} />
            </View>
          </View>
        </View>

        <View style={[styles.section, { marginTop: sectionGap }]}>
          <Text style={styles.label}>Opponent seat</Text>
          <View style={[styles.opponentCards, { marginTop: labelGap }]}>
            <View style={styles.opponentLeftCard}>
              <CardBackFrame size={OPPONENT_CARD_SIZE} variant={item.id} />
            </View>
            <View style={styles.opponentRightCard}>
              <CardBackFrame size={OPPONENT_CARD_SIZE} variant={item.id} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function CardBackFrame({ size, variant }: { size: number; variant: string }) {
  return (
    <View style={[styles.cardFrame, shadows.soft, { width: size, height: size * CARD_ASPECT }]}>
      <CardBack size={size} variant={variant} />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.felt,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  content: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
  },
  section: {
    alignItems: 'center',
  },
  label: {
    height: LABEL_HEIGHT,
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: LABEL_HEIGHT,
    color: colors.onDarkSoft,
  },
  heroCards: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  opponentCards: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  opponentLeftCard: {
    transform: [{ rotate: '-6deg' }],
  },
  opponentRightCard: {
    marginLeft: -OPPONENT_CARD_OVERLAP,
    transform: [{ rotate: '10deg' }],
  },
  cardFrame: {
    borderRadius: 8,
  },
});
