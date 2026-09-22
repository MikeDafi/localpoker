import React, { useEffect, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { PlayingCard, PlayingCardProps } from './PlayingCard';
import { motion, easings } from '../theme/theme';

export interface DealtCardProps extends Omit<PlayingCardProps, 'faceDown'> {
  /** Where the card is thrown from, as an offset (px) from its resting spot. */
  fromX?: number;
  fromY?: number;
  /** Delay before this card is thrown (used to deal one card at a time). */
  delay?: number;
  /** How long the throw takes. */
  throwMs?: number;
  /** Final state: true shows the face (flipping up on arrival / when it changes). */
  faceUp?: boolean;
  /** When false the card just sits in place, face state applied instantly. */
  animate?: boolean;
  /**
   * Skip the turn-over entirely: the card is thrown already face-up. Used for
   * the community cards, which a dealer turns as they're placed rather than
   * pitching face-down.
   */
  noFlip?: boolean;
}

/**
 * A hole card that is *thrown* to a player from the middle of the table and
 * lands face-down, then flips face-up.
 *
 * The flip is a 2D scaleX "squash through zero" (back -> edge -> face) rather
 * than a 3D rotateY. A real 3D flip needs `perspective` + `backfaceVisibility`,
 * and several of those composited over the felt gradient made cards vanish
 * edge-on and mis-render the table, so this keeps the same read without the
 * 3D layer.
 */
export function DealtCard({
  fromX = 0,
  fromY = -160,
  delay = 0,
  throwMs = motion.dealCard,
  faceUp = false,
  animate = true,
  noFlip = false,
  size = 56,
  dimmed,
  ...card
}: DealtCardProps) {
  const h = size * 1.42;
  // Throw progress: 0 = still in the dealer's hand, 1 = landed.
  const p = useSharedValue(animate ? 0 : 1);
  // Flip progress: 0 = back showing, 1 = face showing.
  const flip = useSharedValue(animate && !noFlip ? 0 : faceUp ? 1 : 0);
  const landed = useRef(!animate);
  const thrown = useRef(false);
  // Cards tumble slightly as they're thrown, settling square on arrival.
  const spin = fromX >= 0 ? 14 : -14;

  useEffect(() => {
    if (!animate) {
      p.value = 1;
      thrown.current = true;
      return;
    }
    // A card is thrown exactly once. Without this guard any later change to the
    // timing props restarts the throw, and because the throw begins fully
    // transparent the card vanishes from the table for a moment. Remounting
    // (a new hand, or a different card in the slot) resets it via a new key.
    if (thrown.current) return;
    thrown.current = true;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: throwMs, easing: Easing.bezier(...easings.out) }));
  }, [animate, delay, throwMs, p]);

  useEffect(() => {
    if (!animate || noFlip) {
      flip.value = faceUp ? 1 : 0;
      landed.current = true;
      return;
    }
    if (!landed.current) {
      // First render: land face-down, then turn up a beat after arriving.
      landed.current = true;
      flip.value = faceUp
        ? withDelay(delay + throwMs + 90, withTiming(1, { duration: motion.base, easing: Easing.bezier(...easings.inOut) }))
        : 0;
      return;
    }
    // Later changes (e.g. cards revealed at showdown) flip in place.
    flip.value = withTiming(faceUp ? 1 : 0, { duration: motion.base, easing: Easing.bezier(...easings.inOut) });
  }, [faceUp, animate, noFlip, delay, throwMs, flip]);

  const throwStyle = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: Math.min(1, t * 5),
      transform: [
        { translateX: (1 - t) * fromX },
        { translateY: (1 - t) * fromY },
        { rotate: `${(1 - t) * spin}deg` },
        { scale: 0.72 + t * 0.28 },
      ],
    };
  });

  // Squash horizontally through zero width at the halfway point of the flip.
  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.abs(1 - 2 * flip.value) }],
  }));
  const faceStyle = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 0 : 1 }));

  return (
    <Animated.View style={throwStyle}>
      <Animated.View style={[{ width: size, height: h }, flipStyle]}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, backStyle]}>
          <PlayingCard size={size} faceDown dimmed={dimmed} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, faceStyle]}>
          <PlayingCard size={size} dimmed={dimmed} {...card} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
