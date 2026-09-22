import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { PlayingCard, Suit } from './PlayingCard';
import { colors, radii, motion, easings } from '../theme/theme';

export interface RevealCard {
  rank: number;
  suit: string;
}

export interface ShowdownRevealProps {
  /** The winner's two hole cards, in the order they should land. */
  cards: RevealCard[];
  /** Winner's seat centre, in table-area coordinates. */
  from: { x: number; y: number };
  /** Resting centre of each card's slot in the community row, same coordinates. */
  to: { x: number; y: number }[];
  /** Size the cards sit at beside the avatar, and the size they grow to. */
  smallSize: number;
  bigSize: number;
  /** Whether each card is part of the winning five. */
  highlight: boolean[];
  /** Off when animations are disabled — cards are simply placed, face up. */
  animate?: boolean;
  /** Changes per hand so the sequence replays. */
  revealKey?: string;
}

/** Beats of the reveal, in ms from the start of the showdown. */
export const REVEAL = {
  flip: 260,
  grow: 700,
  move: 1350,
  travelMs: 560,
  ring: 2100,
  perCard: 150,
};

/**
 * The winner's hole cards being shown and then laid out with the board.
 *
 * A showdown used to just flip two 18pt cards face-up beside an avatar, which
 * is unreadable and tells you nothing about *why* the hand won. This plays the
 * sequence a dealer would: turn the cards over, lift them so they can be read,
 * then push them across to sit beside the community cards, where the five cards
 * that actually make the hand are ringed in gold.
 *
 * The cards are positioned absolutely over the felt so nothing about the pod or
 * the community row can clip them mid-flight.
 */
export function ShowdownReveal({
  cards,
  from,
  to,
  smallSize,
  bigSize,
  highlight,
  animate = true,
  revealKey,
}: ShowdownRevealProps) {
  return (
    <View style={styles.layer} pointerEvents="none">
      {cards.map((card, i) => (
        <RevealedCard
          key={`${revealKey}-${i}-${card.rank}${card.suit}`}
          card={card}
          from={from}
          to={to[i] ?? { x: from.x, y: from.y }}
          smallSize={smallSize}
          bigSize={bigSize}
          highlight={!!highlight[i]}
          animate={animate}
          index={i}
        />
      ))}
    </View>
  );
}

function RevealedCard({
  card,
  from,
  to,
  smallSize,
  bigSize,
  highlight,
  animate,
  index,
}: {
  card: RevealCard;
  from: { x: number; y: number };
  to: { x: number; y: number };
  smallSize: number;
  bigSize: number;
  highlight: boolean;
  animate: boolean;
  index: number;
}) {
  const h = bigSize * 1.42;
  const minScale = smallSize / bigSize;

  // 0 = still at the seat, 1 = resting in the community row.
  const travel = useSharedValue(animate ? 0 : 1);
  // 0 = face down, 1 = face up.
  const flip = useSharedValue(animate ? 0 : 1);
  // 0 = seat-sized, 1 = full size.
  const grow = useSharedValue(animate ? 0 : 1);
  const ring = useSharedValue(animate ? 0 : 1);

  const stagger = index * REVEAL.perCard;

  useEffect(() => {
    if (!animate) {
      travel.value = 1;
      flip.value = 1;
      grow.value = 1;
      ring.value = 1;
      return;
    }
    travel.value = 0;
    flip.value = 0;
    grow.value = 0;
    ring.value = 0;

    flip.value = withDelay(
      REVEAL.flip + stagger,
      withTiming(1, { duration: motion.base, easing: Easing.bezier(...easings.inOut) }),
    );
    grow.value = withDelay(
      REVEAL.grow + stagger,
      withTiming(1, { duration: 320, easing: Easing.bezier(...easings.out) }),
    );
    travel.value = withDelay(
      REVEAL.move + stagger,
      withTiming(1, { duration: REVEAL.travelMs, easing: Easing.bezier(...easings.inOut) }),
    );
    // Always runs: it drives the gold ring on the winning cards *and* the fade
    // on the ones that aren't part of the best five. Gating it on `highlight`
    // left the unused hole card at full brightness while the unused board card
    // dimmed, which read as though it counted.
    ring.value = withDelay(REVEAL.ring + stagger, withTiming(1, { duration: motion.base }));
  }, [animate, highlight, stagger, travel, flip, grow, ring]);

  const moveStyle = useAnimatedStyle(() => {
    const t = travel.value;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const scale = minScale + (1 - minScale) * grow.value;
    return {
      // Positioned by its centre so growing and travelling stay concentric.
      left: x - bigSize / 2,
      top: y - h / 2,
      transform: [{ scale }],
    };
  });

  // Same 2D squash-through-zero flip used when cards are dealt: no 3D layer, so
  // nothing mis-composites against the felt.
  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.abs(1 - 2 * flip.value) }],
  }));
  const faceStyle = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 0 : 1 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: highlight ? ring.value : 0 }));
  const dimStyle = useAnimatedStyle(() => ({
    // Cards outside the best five fade back once the ring lands on the others.
    opacity: highlight ? 1 : 1 - 0.55 * ring.value,
  }));

  return (
    <Animated.View style={[styles.card, { width: bigSize, height: h }, moveStyle]}>
      <Animated.View style={[{ width: bigSize, height: h }, flipStyle]}>
        <Animated.View
          style={[styles.ring, { borderRadius: radii.sm + 2 }, ringStyle]}
          pointerEvents="none"
        />
        <Animated.View style={[styles.stack, backStyle]}>
          <PlayingCard size={bigSize} faceDown />
        </Animated.View>
        <Animated.View style={[styles.stack, faceStyle, dimStyle]}>
          <PlayingCard size={bigSize} rank={card.rank} suit={card.suit as Suit} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 },
  card: { position: 'absolute' },
  stack: { position: 'absolute', top: 0, left: 0 },
  ring: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: 'rgba(214,180,92,0.16)',
  },
});
