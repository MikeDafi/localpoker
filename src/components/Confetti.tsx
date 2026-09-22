import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { colors } from '../theme/theme';

const PIECE_COLORS = [colors.blue, colors.gold, colors.red, colors.green, colors.accent, colors.accentPink, colors.accentAlt];

interface PieceProps {
  index: number;
  width: number;
  height: number;
  duration: number;
}

function Piece({ index, width, height, duration }: PieceProps) {
  const startX = width / 2 + (Math.random() - 0.5) * width * 0.5;
  const launchX = (Math.random() - 0.5) * width * 0.9;
  const swayAmp = 16 + Math.random() * 26;
  const size = 6 + Math.random() * 8;
  const isCircle = Math.random() < 0.28;
  const color = PIECE_COLORS[index % PIECE_COLORS.length];
  const spin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4);
  const delay = Math.random() * 250;
  const fall = height * (0.75 + Math.random() * 0.3);

  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.bezier(0.2, 0.6, 0.3, 1) }));
  }, [p, delay, duration]);

  const style = useAnimatedStyle(() => {
    const t = p.value;
    const y = -30 * Math.sin(Math.min(t, 0.15) / 0.15 * Math.PI) + fall * t * t;
    const x = launchX * t + Math.sin(t * Math.PI * 3) * swayAmp;
    const flip = Math.cos(t * Math.PI * spin);
    return {
      opacity: t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${t * spin * 360}deg` },
        { scaleY: 0.4 + Math.abs(flip) * 0.6 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: -16,
          left: startX,
          width: size,
          height: isCircle ? size : size * 1.7,
          borderRadius: isCircle ? size : 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export interface ConfettiProps {
  count?: number;
  durationMs?: number;
}

/** A one-shot premium confetti burst overlay. Mount to fire; unmount to clear. */
export function Confetti({ count = 40, durationMs = 2600 }: ConfettiProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => (
        <Piece key={i} index={i} width={width} height={height} duration={durationMs} />
      ))}
    </View>
  );
}
