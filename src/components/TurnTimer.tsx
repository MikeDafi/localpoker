import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts, radii, numeric } from '../theme/theme';
import { sound } from '../services/sound';

export interface TurnTimerProps {
  seconds: number;
  /** timer runs while active; resets whenever resetKey changes */
  active: boolean;
  resetKey: string;
  onExpire?: () => void;
  label?: string;
  /** play a countdown tick during the final seconds (use for the human's turn) */
  warn?: boolean;
  /** wall-clock origin for the countdown; defaults to mount time. Lets a resumed
   * game carry over the remaining time instead of restarting from full. */
  startedAt?: number;
}

/**
 * A per-turn countdown bar. Turns amber then red as time runs low.
 *
 * The bar runs on the UI thread and the number only re-renders when its whole
 * second changes. It used to set state ten times a second and resize the bar
 * by width, a re-render and a layout pass every 100 ms of every turn.
 */
export function TurnTimer({ seconds, active, resetKey, onExpire, label, warn, startedAt }: TurnTimerProps) {
  const [left, setLeft] = useState(Math.ceil(seconds));
  const fill = useSharedValue(1);
  const expired = useRef(false);
  const lastTick = useRef(-1);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const started = startedAt ?? Date.now();
    const initialRemaining = Math.max(0, seconds - (Date.now() - started) / 1000);
    setLeft(Math.ceil(initialRemaining));
    cancelAnimation(fill);
    fill.value = seconds > 0 ? initialRemaining / seconds : 0;
    if (active && initialRemaining > 0) {
      fill.value = withTiming(0, { duration: initialRemaining * 1000, easing: Easing.linear });
    }
    expired.current = false;
    lastTick.current = -1;
    if (!active) return;
    if (initialRemaining <= 0) {
      expired.current = true;
      onExpireRef.current?.();
      return;
    }
    const id = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const remaining = Math.max(0, seconds - elapsed);
      setLeft(Math.ceil(remaining));
      // Audible countdown in the final 5 seconds (once per whole second).
      if (warn) {
        const whole = Math.ceil(remaining);
        if (whole !== lastTick.current && whole <= 5 && whole > 0) {
          lastTick.current = whole;
          sound.play(whole <= 3 ? 'tickUrgent' : 'tick');
        }
      }
      if (remaining <= 0 && !expired.current) {
        expired.current = true;
        clearInterval(id);
        onExpireRef.current?.();
      }
    }, 100);
    return () => clearInterval(id);
  }, [resetKey, active, seconds, warn, startedAt, fill]);
  useEffect(() => () => cancelAnimation(fill), [fill]);

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  const pct = Math.max(0, Math.min(1, left / seconds));
  const color = pct > 0.5 ? colors.green : pct > 0.25 ? colors.amber : colors.red;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label ?? 'Your turn'}</Text>
        <Text style={[styles.secs, { color }]}>{left}s</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, barStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onDarkSoft },
  secs: { fontFamily: fonts.bold, fontSize: 13, ...numeric },
  track: { height: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceBorder, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: radii.pill, transformOrigin: 'left' },
});
