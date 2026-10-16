import React, { useEffect, useState } from 'react';
import { Text, TextProps, TextStyle, StyleProp, AccessibilityInfo } from 'react-native';

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}

/*
 * Asked once for the app rather than once per change. Every pot change used
 * to make its own round trip to native for the same answer.
 */
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduceMotion = r; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r) => { reduceMotion = r; });

/** Twenty updates a second reads as rolling; sixty only costs more renders. */
const FRAME_MS = 50;

/**
 * Counts up/down to `value` with a smooth easing tween. Great for pot sizes,
 * stacks, and coin balances so numbers roll instead of snapping.
 */
export function AnimatedNumber({ value, durationMs = 500, format, style, ...rest }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    let cancelled = false;
    let shownAt = 0;

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
      if (reduceMotion) {
        setDisplay(to);
        return;
      }
      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      if (t >= 1) {
        setDisplay(to);
        return;
      }
      if (now - shownAt >= FRAME_MS) {
        shownAt = now;
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(Math.round(from + (to - from) * eased));
      }
      requestAnimationFrame(tick);
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
