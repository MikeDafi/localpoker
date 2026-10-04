import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeOut, ZoomIn } from 'react-native-reanimated';
import { EMOJI_EMOTES } from '../../game/cosmetics';
import { colors, easings, fonts, motion, radii, shadows, spacing } from '../../theme/theme';
import type { StorePreviewProps } from './types';

const REPLAY_MS = 1600;
const TRAY_CHIP_SIZE = 52;
const TRAY_GAP = 8;
const SEAT_WIDTH = 84;
const SEAT_RING_SIZE = 52;
const SEAT_AVATAR_SIZE = 42;

export function EmotePreview({ item, width }: StorePreviewProps) {
  const [replayKey, setReplayKey] = useState(0);
  const emoji = EMOJI_EMOTES[item.id]?.emoji ?? item.emoji;
  const previewWidth = Math.max(0, width);
  const tableWidth = Math.min(previewWidth, 360);
  const tableHeight = Math.max(176, Math.round(tableWidth * 0.52));
  const trayCount = Math.max(1, Math.min(5, Math.floor((previewWidth + TRAY_GAP) / (TRAY_CHIP_SIZE + TRAY_GAP))));
  const trayEmojis = useMemo(() => {
    const choices = Object.values(EMOJI_EMOTES)
      .map((candidate) => candidate.emoji)
      .filter((candidate) => candidate !== emoji);
    const beforeCount = Math.floor((trayCount - 1) / 2);
    const afterCount = trayCount - beforeCount - 1;
    return [
      ...choices.slice(0, beforeCount),
      emoji,
      ...choices.slice(beforeCount, beforeCount + afterCount),
    ];
  }, [emoji, trayCount]);

  useEffect(() => {
    const timer = setInterval(() => setReplayKey((key) => key + 1), REPLAY_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.wrap, { width: previewWidth }]}>
      <View style={[styles.tableStage, { width: tableWidth, height: tableHeight }]}>
        <View style={styles.feltOval}>
          <View style={styles.boardHint} />
          <View style={styles.potChip}>
            <Text style={styles.potText}>120</Text>
          </View>
          <View style={styles.seatWrap}>
            <View style={styles.emoteAnchor} pointerEvents="none">
              <Animated.View
                key={replayKey}
                entering={ZoomIn.duration(motion.fast).easing(Easing.bezier(...easings.out))}
                exiting={FadeOut.duration(motion.instant)}
                style={[styles.emoteBubble, shadows.soft]}
              >
                <Text style={styles.emoteEmoji}>{emoji}</Text>
              </Animated.View>
            </View>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarRing}>
                <Text style={styles.avatarFace}>🐾</Text>
              </View>
              <View style={styles.dealerChip}>
                <Text style={styles.dealerText}>D</Text>
              </View>
            </View>
            <View style={[styles.nameTag, shadows.soft]}>
              <Text style={styles.nameText}>Mika</Text>
              <Text style={styles.chipText}>2,450</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.trayPanel}>
        <Text style={styles.sectionLabel}>Emoji tray</Text>
        <View style={styles.emojiGrid}>
          {trayEmojis.map((trayEmoji, index) => (
            <View key={`${trayEmoji}-${index}`} style={styles.emojiChip}>
              <Text style={styles.trayEmoji}>{trayEmoji}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  tableStage: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  feltOval: {
    width: '92%',
    height: '78%',
    borderRadius: 999,
    backgroundColor: '#0E5C45',
    borderWidth: 10,
    borderColor: '#173A32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardHint: {
    width: 94,
    height: 34,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  potChip: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  potText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.gold,
  },
  seatWrap: {
    position: 'absolute',
    top: 18,
    width: SEAT_WIDTH,
    alignItems: 'center',
  },
  emoteAnchor: {
    position: 'absolute',
    top: -44,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  emoteBubble: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    maxWidth: 150,
  },
  emoteEmoji: {
    fontSize: 30,
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
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
  avatarFace: {
    fontSize: SEAT_AVATAR_SIZE * 0.58,
  },
  dealerChip: {
    position: 'absolute',
    bottom: -2,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#2A2210',
  },
  nameTag: {
    marginTop: 3,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 2,
    maxWidth: SEAT_WIDTH,
  },
  nameText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.onDark,
    maxWidth: SEAT_WIDTH,
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.onDark,
  },
  trayPanel: {
    width: '100%',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginBottom: spacing.xs,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TRAY_GAP,
    marginTop: 2,
  },
  emojiChip: {
    width: TRAY_CHIP_SIZE,
    height: TRAY_CHIP_SIZE,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayEmoji: {
    fontSize: 30,
  },
});
