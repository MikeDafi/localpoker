import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_PAL, type PalConfig } from '../../avatar/palConfig';
import { PalMotion } from '../PalMotion';
import { palMotionByCosmeticId } from '../../game/cosmetics';
import { useApp } from '../../state/AppContext';
import { colors, fonts, radii, shadows, spacing } from '../../theme/theme';
import type { StorePreviewProps } from './types';

/** The sizes a Pal is actually drawn at on a seat, from `Seat.tsx`. */
const SEAT_AVATAR_SIZE = 42;
const SEAT_RING_SIZE = SEAT_AVATAR_SIZE + 10;
const SEAT_WIDTH = 84;
const LARGE_MAX = 148;

function profilePal(profile: { pal?: PalConfig } | null | undefined): PalConfig {
  return profile?.pal ?? DEFAULT_PAL;
}

/**
 * A motion on the buyer's own Pal, twice: once big and once at seat size.
 *
 * Big answers "what is this gesture", and seat size answers the question that
 * actually decides the purchase, which is whether anyone will be able to tell
 * from across the felt. A preview that only showed the large one would be
 * selling a different picture from the one the table gets.
 */
export function PalMotionPreview({ item, width }: StorePreviewProps) {
  const { profile } = useApp();
  const pal = profilePal(profile);
  const motion = palMotionByCosmeticId(item.id);
  const previewWidth = Math.max(0, width);
  const largeSize = Math.min(LARGE_MAX, Math.max(SEAT_AVATAR_SIZE, Math.floor(previewWidth * 0.46)));
  const panelWidth = Math.min(previewWidth, 340);

  if (!motion) {
    return (
      <View style={[styles.wrap, { width: previewWidth }]}>
        <Text style={styles.missingText}>No motion for this item yet.</Text>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${item.name} motion preview`}
      style={[styles.wrap, { width: previewWidth }]}
    >
      <View style={[styles.stage, { width: panelWidth }]}>
        <View style={[styles.largeRing, { width: largeSize + 16, height: largeSize + 16, borderRadius: (largeSize + 16) / 2 }]}>
          <PalMotion config={pal} motionId={motion.motionId} size={largeSize} loop />
        </View>
        {/* The sheet above already prints the name and the description, so
            repeating them here was the same two lines twice on one screen. */}
      </View>

      <View style={[styles.tablePanel, { width: panelWidth }]}>
        <Text style={styles.sectionLabel}>At the table</Text>
        <View style={styles.tableRow}>
          <SeatSizeMotion label="You" pal={pal} motionId={motion.motionId} />
          <View style={styles.tableDivider} />
          <View style={styles.seatNote}>
            <Text style={styles.seatNoteText}>
              Sent from the reaction tray. Everyone at the table watches your Pal do it.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SeatSizeMotion({ label, pal, motionId }: { label: string; pal: PalConfig; motionId: string }) {
  return (
    <View style={styles.seatPreview}>
      <View style={styles.seatRing}>
        <PalMotion config={pal} motionId={motionId} size={SEAT_AVATAR_SIZE} loop />
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
  stage: {
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    ...shadows.soft,
  },
  largeRing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.surfaceBorderStrong,
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
  },
  tableDivider: {
    width: 1,
    height: 68,
    marginHorizontal: spacing.md,
    backgroundColor: colors.surfaceBorder,
  },
  seatPreview: {
    width: SEAT_WIDTH,
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
    maxWidth: SEAT_WIDTH,
  },
  nameText: {
    maxWidth: 76,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.onDark,
  },
  seatNote: {
    flex: 1,
  },
  seatNoteText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onDarkSoft,
  },
  missingText: {
    paddingVertical: spacing.xl,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.inkMuted,
  },
});
