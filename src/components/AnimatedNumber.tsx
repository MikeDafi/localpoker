import React, { useEffect, useState } from 'react';
import { Text, TextProps, TextStyle, StyleProp, AccessibilityInfo } from 'react-native';

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}

/**
 * Counts up/down to `value` with a smooth easing tween. Great for pot sizes,
 * stacks, and coin balances so numbers roll instead of snapping.
 */
export function AnimatedNumber({ value, durationMs = 500, format, style, ...rest }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    let cancelled = false;
    let reduce = false;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduce = r)).catch(() => {});

    const from = display;
    const to = value;
    if (from === to) return;
    if (durationMs <= 0) {
      setDisplay(to);
      return;
    }
    const start = Date.now();
    const tick = () => {
      if (cancelled) return;
      if (reduce) {
        setDisplay(to);
        return;
      }
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(tick);
      else setDisplay(to);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = format ? format(display) : display.toLocaleString();
  return (
    <Text style={style} {...rest}>
      {text}
    </Text>
  );
}
