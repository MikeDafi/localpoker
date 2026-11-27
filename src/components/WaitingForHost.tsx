import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { useScreenActive } from './useScreenActive';

const CHIPS = [colors.red, colors.gold, colors.green];

/** One chip hopping in turn with the others, so the three read as a wave. */
function Chip({ color, index, still }: { color: string; index: number; still: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (still) {
      // Settle where it is going rather than freeze mid hop, and stop asking
      // for frames: a loop left running here kept animating under the table.
      cancelAnimation(y);
      y.value = 0;
      return undefined;
    }
    y.value = withDelay(
      index * 160,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 320 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(y);
  }, [index, still, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.chip, { backgroundColor: color }, style]}>
      <View style={styles.chipInner} />
    </Animated.View>
  );
}

/**
 * A guest's wait for the deal, as something to look at.
 *
 * It was a grey line of text, which on a screen you may sit on for a minute
 * read as the app having stalled. Chips hopping in turn say "any moment now"
 * without a word, and stop when the player has asked for less motion.
 */
export function WaitingForHost({ reduceMotion = false }: { reduceMotion?: boolean }) {
  // Paused under another screen or in the background; see useScreenActive.
  const screenActive = useScreenActive();
  return (
    <View style={styles.card} accessible accessibilityLabel="Waiting for the host to start">
      <View style={styles.chips}>
        {CHIPS.map((c, i) => <Chip key={c} color={c} index={i} still={reduceMotion || !screenActive} />)}
      </View>
      <Text style={styles.text}>Waiting for the host</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md,
    backgroundColor: colors.blue, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: spacing.lg,
  },
  chips: { flexDirection: 'row', gap: 6, height: 26, alignItems: 'flex-end' },
  chip: {
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  chipInner: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  text: { fontFamily: fonts.bold, fontSize: 16, color: colors.onBlue },
});
