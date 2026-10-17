import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WiiButton } from './WiiButton';
import { colors, fonts, radii, shadows, spacing } from '../theme/theme';
import { getAppReduceMotion, subscribeAppReduceMotion } from '../theme/motionPreference';

/** A rectangle in window coordinates. */
export interface CoachRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What to spread onto the View a coach mark points at. */
export interface CoachTargetProps {
  ref: React.RefObject<View | null>;
  onLayout: () => void;
  collapsable: false;
}

/**
 * Measure a real control so a coach mark can ring it.
 *
 * Measured in window coordinates because the control and the coach mark sit
 * in different parents, and measured again shortly after mounting because
 * the menus slide their panels in: `onLayout` reports where a panel will end
 * up, `measureInWindow` reports where it is mid-slide.
 */
export function useCoachTarget(active: boolean): { rect: CoachRect | null; props: CoachTargetProps | undefined } {
  const ref = useRef<View | null>(null);
  const [rect, setRect] = useState<CoachRect | null>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (!width || !height) return;
      setRect((prev) => (prev && prev.x === x && prev.y === y && prev.width === width && prev.height === height
        ? prev
        : { x, y, width, height }));
    });
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    const timers = [120, 500, 1000].map((ms) => setTimeout(measure, ms));
    return () => timers.forEach(clearTimeout);
  }, [active, measure]);
  return {
    rect: active ? rect : null,
    props: active ? { ref, onLayout: measure, collapsable: false } : undefined,
  };
}

export interface CoachMarkProps {
  title: string;
  body: string;
  /** The control being taught, in window coordinates. Without one the card sits at `placement`. */
  target?: CoachRect | null;
  placement?: 'top' | 'bottom';
  /**
   * Pin the card to an edge even when there is a target, for a control with
   * more controls on both sides of it that the card would otherwise cover.
   */
  pinned?: boolean;
  /** How far in from the edge an unanchored card sits, to clear a header. */
  edgeOffset?: number;
  /** Shown under the body, for when the control is not on screen yet. */
  hint?: string;
  nextLabel?: string;
  onNext?: () => void;
  onSkip: () => void;
}

const RING_PAD = 6;
const GAP = 14;

/**
 * A coach mark: a ring round a real control and a card explaining it.
 *
 * It never covers what it points at. The overlay passes touches through
 * everywhere except the card itself, the ring draws nothing that takes a
 * touch, and the card sits on whichever side of the control has more room.
 * Skip is on every card, because a tutorial nobody can leave is a trap.
 */
export function CoachMark({ title, body, target, placement = 'top', pinned, edgeOffset = spacing.lg, hint, nextLabel, onNext, onSkip }: CoachMarkProps) {
  const rootRef = useRef<View | null>(null);
  // The overlay fills the screen's safe area view, and an absolute child is
  // placed from its edge rather than inside its padding, so the insets are
  // added back by hand or a pinned card slides under the notch.
  const insets = useSafeAreaInsets();
  const [frame, setFrame] = useState<CoachRect | null>(null);
  const measureRoot = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    rootRef.current?.measureInWindow((x, y) => setFrame({ x, y, width, height }));
  }, []);

  const reduceMotion = useSyncExternalStore(subscribeAppReduceMotion, getAppReduceMotion, getAppReduceMotion);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [reduceMotion, pulse]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // The target relative to this overlay, once both have been measured.
  const local = target && frame
    ? { x: target.x - frame.x, y: target.y - frame.y, width: target.width, height: target.height }
    : null;
  // Below a target in the top half, above one in the bottom half, so the card
  // always opens into the larger stretch of screen and away from the control.
  const pointing = !!local && !!frame && !pinned;
  const above = local && frame && !pinned ? local.y + local.height / 2 > frame.height / 2 : placement === 'bottom';
  const cardPos = local && frame && !pinned
    ? above
      ? { bottom: frame.height - local.y + GAP }
      : { top: local.y + local.height + GAP }
    : placement === 'bottom'
      ? { bottom: insets.bottom + edgeOffset }
      : { top: insets.top + edgeOffset };
  const arrowLeft = pointing && local && frame
    ? Math.max(spacing.lg, Math.min(frame.width - spacing.lg * 3, local.x + local.width / 2 - spacing.md - 7))
    : null;

  return (
    <View ref={rootRef} style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none" onLayout={measureRoot}>
      {local ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            ringStyle,
            {
              left: local.x - RING_PAD,
              top: local.y - RING_PAD,
              width: local.width + RING_PAD * 2,
              height: local.height + RING_PAD * 2,
            },
          ]}
        />
      ) : null}
      <Animated.View
        key={title}
        entering={reduceMotion ? undefined : FadeIn.duration(220)}
        style={[styles.card, shadows.soft, cardPos]}
        accessibilityRole="summary"
      >
        {arrowLeft !== null ? (
          <View pointerEvents="none" style={[styles.arrow, above ? styles.arrowDown : styles.arrowUp, { left: arrowLeft }]} />
        ) : null}
        <Text style={styles.eyebrow}>Tutorial</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <View style={styles.row}>
          <Pressable
            onPress={onSkip}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
          >
            <Text style={styles.skip}>Skip tutorial</Text>
          </Pressable>
          {nextLabel && onNext ? (
            <WiiButton label={nextLabel} variant="gold" size="sm" onPress={onNext} />
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 50, elevation: 50 },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: colors.gold,
    borderRadius: radii.md,
  },
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.gold,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  arrow: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: colors.panel,
    borderColor: colors.gold,
    transform: [{ rotate: '45deg' }],
  },
  arrowDown: { bottom: -8, borderRightWidth: 2, borderBottomWidth: 2 },
  arrowUp: { top: -8, borderLeftWidth: 2, borderTopWidth: 2 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, color: colors.goldDeep, textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginTop: 2 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.inkSoft, marginTop: 4 },
  hint: { fontFamily: fonts.medium, fontSize: 13, color: colors.blueDeep, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, minHeight: 40 },
  skip: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkMuted, textDecorationLine: 'underline' },
});
