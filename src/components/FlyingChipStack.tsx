import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { ChipStack } from './ChipStack';
import { easings } from '../theme/theme';
import type { ChipPoint } from '../game/chipMotion';

const CHIP_VISUAL_SIZE = 22;
const CHIP_CENTER_OFFSET = 12;
const CHIP_ARC_HEIGHT = 18;

export interface FlyingChipStackProps {
  amount: number;
  from: ChipPoint;
  to: ChipPoint;
  delayMs: number;
  durationMs: number;
  onDone: () => void;
}

export function FlyingChipStack({ amount, from, to, delayMs, durationMs, onDone }: FlyingChipStackProps) {
  const progress = useSharedValue(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finish = useCallback(() => {
    onDoneRef.current();
  }, []);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: durationMs, easing: Easing.bezier(...easings.inOut) }, (finished) => {
        if (finished) runOnJS(finish)();
      }),
    );
    return () => cancelAnimation(progress);
  }, [delayMs, durationMs, finish, from.x, from.y, progress, to.x, to.y]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const x = from.x + (to.x - from.x) * t - CHIP_CENTER_OFFSET;
    const y = from.y + (to.y - from.y) * t - CHIP_CENTER_OFFSET - Math.sin(Math.PI * t) * CHIP_ARC_HEIGHT;
    return {
      opacity: t >= 1 ? 0 : 1,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: 0.92 + 0.08 * (1 - t) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <ChipStack amount={amount} size={CHIP_VISUAL_SIZE} showLabel={false} compact />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 80,
  },
});
