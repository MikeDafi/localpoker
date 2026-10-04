import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
  type EasingFunction, type SharedValue,
} from 'react-native-reanimated';
import { PalAvatar, type PalExpression } from './PalAvatar';
import type { PalConfig } from '../avatar/palConfig';
import { getAppReduceMotion, subscribeAppReduceMotion } from '../theme/motionPreference';
import {
  PAL_MOTION_ACCENT_REST, PAL_MOTION_REST, palMotionByMotionId, palMotionTrack, palMotionTrackIsStill,
  type PalMotionChannel, type PalMotionEasing, type PalMotionFrame, type PalMotionPose, type PalMotionStep,
} from '../game/palMotions';

export interface PalMotionProps {
  config: PalConfig;
  /** The short id a reaction carries, for example 'wave'. */
  motionId: string;
  /** Diameter of the Pal. The motion is written in fractions of this. */
  size?: number;
  /** Changing this replays the motion, so the same one can be sent twice. */
  replayKey?: string | number;
  /** Play over and over, for the store preview. */
  loop?: boolean;
  /** Pause between loops, so a repeated gesture reads as a gesture. */
  loopGapMs?: number;
}

const EASING_CURVES: Record<PalMotionEasing, EasingFunction> = {
  sine: Easing.inOut(Easing.sin),
  out: Easing.out(Easing.cubic),
  linear: Easing.linear,
};

/**
 * Smallest an accent glyph is ever drawn.
 *
 * Accents are a fraction of the Pal so they stay in proportion, but a seat
 * avatar is 42 points and a strictly proportional tear is four points of
 * nothing. The floor costs a little proportion at seat size and buys the one
 * thing the motion is for, which is being seen from across the felt.
 */
const MIN_ACCENT_PT = 16;

/**
 * A Pal performing a motion.
 *
 * The face comes from `PalAvatar`'s existing expression vocabulary rather
 * than from anything new: a motion holds one expression for its whole length
 * and supplies the movement around it. `AnimatedPal` is deliberately not used
 * here, because its built-in reaction pops would play on top of the
 * keyframes and the two would fight over the same transform.
 */
export function PalMotion({
  config,
  motionId,
  size = 72,
  replayKey = 0,
  loop = false,
  loopGapMs = 520,
}: PalMotionProps) {
  const motion = useMemo(() => palMotionByMotionId(motionId), [motionId]);
  const reduceMotion = useReduceMotion();

  const bodyX = useSharedValue(0);
  const bodyY = useSharedValue(0);
  const bodyRotate = useSharedValue(0);
  const bodyScale = useSharedValue(1);
  const accentX = useSharedValue(0);
  const accentY = useSharedValue(0);
  const accentRotate = useSharedValue(0);
  const accentScale = useSharedValue(1);
  const accentOpacity = useSharedValue(0);

  useEffect(() => {
    const channels: SharedValue<number>[] = [
      bodyX, bodyY, bodyRotate, bodyScale, accentX, accentY, accentRotate, accentScale, accentOpacity,
    ];
    const stop = () => channels.forEach((channel) => cancelAnimation(channel));
    stop();
    bodyX.value = 0;
    bodyY.value = 0;
    bodyRotate.value = 0;
    bodyScale.value = 1;
    accentX.value = 0;
    accentY.value = 0;
    accentRotate.value = 0;
    accentScale.value = 1;
    accentOpacity.value = 0;

    if (!motion) return stop;

    /*
     * Reduce Motion still has to say something.
     *
     * Skipping the animation entirely would mean a player who has turned
     * movement off sends a wave and the table sees nothing at all, so the
     * gesture is held instead of played: the expression is on the face either
     * way, and the accent sits where it rests rather than swinging.
     */
    if (reduceMotion) {
      if (motion.accent) accentOpacity.value = 1;
      return stop;
    }

    const run = (
      channel: SharedValue<number>,
      frames: readonly PalMotionFrame[],
      key: PalMotionChannel,
      rest: Required<PalMotionPose>,
      unit: number,
    ) => {
      const steps = palMotionTrack(frames, key, rest);
      const restValue = rest[key] * unit;
      if (palMotionTrackIsStill(steps, rest[key])) {
        channel.value = restValue;
        return;
      }
      channel.value = buildSequence(steps, unit, loop ? loopGapMs : null, restValue);
    };

    run(bodyX, motion.frames, 'translateX', PAL_MOTION_REST, size);
    run(bodyY, motion.frames, 'translateY', PAL_MOTION_REST, size);
    run(bodyRotate, motion.frames, 'rotate', PAL_MOTION_REST, 1);
    run(bodyScale, motion.frames, 'scale', PAL_MOTION_REST, 1);

    if (motion.accent) {
      const { frames } = motion.accent;
      run(accentX, frames, 'translateX', PAL_MOTION_ACCENT_REST, size);
      run(accentY, frames, 'translateY', PAL_MOTION_ACCENT_REST, size);
      run(accentRotate, frames, 'rotate', PAL_MOTION_ACCENT_REST, 1);
      run(accentScale, frames, 'scale', PAL_MOTION_ACCENT_REST, 1);
      run(accentOpacity, frames, 'opacity', PAL_MOTION_ACCENT_REST, 1);
    }

    // Everything above runs on the UI thread and would outlive this seat, so
    // the teardown is not optional: a leaked loop at a pod that has been
    // recycled animates whoever sits there next.
    return stop;
  }, [
    // `replayKey` is read by nothing in here on purpose: re-running this
    // effect *is* the replay, so a caller sending the same motion twice
    // changes the key and gets the gesture again.
    motion, reduceMotion, size, loop, loopGapMs, replayKey,
    bodyX, bodyY, bodyRotate, bodyScale, accentX, accentY, accentRotate, accentScale, accentOpacity,
  ]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bodyX.value },
      { translateY: bodyY.value },
      { rotate: `${bodyRotate.value}deg` },
      { scale: bodyScale.value },
    ],
  }));

  const accentStyle = useAnimatedStyle(() => ({
    opacity: accentOpacity.value,
    transform: [
      { translateX: accentX.value },
      { translateY: accentY.value },
      { rotate: `${accentRotate.value}deg` },
      { scale: accentScale.value },
    ],
  }));

  const accent = motion?.accent;
  const glyph = accent ? Math.max(MIN_ACCENT_PT, size * accent.scale) : 0;
  const face: PalExpression = motion?.face ?? 'idle';

  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
      <Animated.View style={bodyStyle}>
        <PalAvatar config={config} size={size} expression={face} />
      </Animated.View>
      {accent ? (
        <Animated.Text
          style={[
            styles.accent,
            {
              fontSize: glyph,
              lineHeight: glyph * 1.14,
              left: size / 2 + accent.x * size - glyph / 2,
              top: size / 2 + accent.y * size - glyph / 2,
            },
            accentStyle,
          ]}
        >
          {accent.emoji}
        </Animated.Text>
      ) : null}
    </View>
  );
}

/**
 * The steps of one channel, as an animation.
 *
 * A pause is appended rather than built into the data when the motion loops,
 * because the gap belongs to the preview that is replaying it and not to the
 * gesture: a wave sent at a table plays once and stops.
 */
function buildSequence(
  steps: readonly PalMotionStep[],
  unit: number,
  gapMs: number | null,
  restValue: number,
) {
  const timings = steps.map((step) => withTiming(step.value * unit, {
    duration: step.duration,
    easing: EASING_CURVES[step.easing],
  }));
  if (gapMs !== null && gapMs > 0) {
    timings.push(withTiming(restValue, { duration: gapMs, easing: Easing.linear }));
  }
  const sequence = withSequence(timings[0]!, ...timings.slice(1));
  return gapMs === null ? sequence : withRepeat(sequence, -1, false);
}

/**
 * Whether motion is reduced, by the system or by the app's own setting.
 *
 * Both, for the same reason `AnimatedPal` reads both: the app setting exists
 * for people who want the game still without turning animation off for the
 * whole phone, and the system one has to be obeyed regardless.
 */
function useReduceMotion(): boolean {
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  const appReduceMotion = useSyncExternalStore(subscribeAppReduceMotion, getAppReduceMotion, getAppReduceMotion);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setOsReduceMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setOsReduceMotion);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return osReduceMotion || appReduceMotion;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  accent: { position: 'absolute', textAlign: 'center' },
});
