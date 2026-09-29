import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows, spacing } from '../theme/theme';
import { WiiButton } from './WiiButton';
import { subscribeOpenRooms } from '../services/firebase/roomSync';
import type { RoomSummary } from '../services/firebase/types';

/**
 * A friend's table, offered where the player already is.
 *
 * An invite previously went one of two places: a push notification, which is
 * suppressed for anyone already using the app on the grounds that they would
 * see it in the list, and that list, which they only see if they happen to
 * walk to Join Room. So inviting someone sitting in the app did nothing they
 * would notice.
 *
 * This is the missing half: if a friend opens a table while you are looking at
 * the app, it says so, once, with a way straight in.
 */
export function InviteBanner({
  enabled,
  onJoin,
}: {
  enabled: boolean;
  /** Called with the room code when the player takes the offer. */
  onJoin: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [offer, setOffer] = useState<RoomSummary | null>(null);
  /*
   * Codes already offered, so a banner that was dismissed does not come
   * straight back on the next snapshot. The listener fires on every change to
   * the invite list, including ones that have nothing to do with this table.
   */
  const seen = useRef<Set<string>>(new Set());
  const firstSnapshot = useRef(true);

  useEffect(() => {
    if (!enabled) {
      setOffer(null);
      return undefined;
    }
    return subscribeOpenRooms(({ friends }) => {
      /*
       * Everything already open when the app started is not news. Without
       * this, opening the app raised a banner for a table invited hours ago,
       * which is the sort of thing that teaches people to ignore banners.
       */
      if (firstSnapshot.current) {
        firstSnapshot.current = false;
        friends.forEach((room) => seen.current.add(room.code));
        return;
      }
      const fresh = friends.find((room) => !seen.current.has(room.code));
      if (!fresh) return;
      seen.current.add(fresh.code);
      setOffer(fresh);
    });
  }, [enabled]);

  if (!offer) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(160)}
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, shadows.raised]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{`${offer.hostName || 'A friend'} opened a table`}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {`#${offer.code} · ${offer.smallBlind}/${offer.bigBlind}`}
          </Text>
        </View>
        <WiiButton
          label="Join"
          variant="green"
          size="sm"
          onPress={() => { const code = offer.code; setOffer(null); onJoin(code); }}
        />
        <Pressable
          onPress={() => setOffer(null)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss invite"
          style={styles.dismiss}
        >
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.onDark },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onDarkSoft, marginTop: 1 },
  dismiss: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dismissText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onDarkSoft },
});
