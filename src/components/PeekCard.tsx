import React, { useEffect, useId, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { CardFaceContent, PlayingCard } from './PlayingCard';
import {
  CardBackLattice,
  CardBackRosette,
  cardBackGeometry,
  cardBackTheme,
  type CardBackVariant,
} from './CardBack';
import { motion, easings, colors, radii } from '../theme/theme';
import type { Suit } from '../game/cardFace';
import { creaseFor, creaseSegment, reflectMatrix, type Crease } from '../game/peelFold';

/**
 * The shared state of a peel.
 *
 * It lives outside the card because a peel is not something you do to one card.
 * You hold both hole cards together and lift them together, and an app where
 * dragging one leaves the other lying flat feels like sorting a filing cabinet
 * rather than looking at a hand. `HoleCards` owns one of these and hands it to
 * every card it draws, so a single drag moves all of them.
 */
export interface PeelControl {
  /** How far the pinned point has been dragged, in px. */
  fold: SharedValue<number>;
  /** The pinned point, in card space. */
  anchorX: SharedValue<number>;
  anchorY: SharedValue<number>;
  /** Unit vector: the direction it is being dragged. */
  dirX: SharedValue<number>;
  dirY: SharedValue<number>;
  /** How far it may be dragged this way; depends on which way that is. */
  limit: SharedValue<number>;
}

/** Timings for showing a hand to the table, shared with whoever drives the fold. */
export const PEEL_TIMING = { open: 260, hold: 520, close: 170, flip: 420 };

const THROW_MS = motion.dealCard;

export interface PeekCardProps {
  rank: number;
  suit: Suit;
  size: number;
  peel: PeelControl;
  /** Throw-in offsets, matching DealtCard so the deal still reads the same. */
  fromX?: number;
  fromY?: number;
  delay?: number;
  animate?: boolean;
  /** How long the card stays face-up after landing before it covers itself. */
  showOnDealMs?: number;
  /** Lay the card face up and leave it there (showdown, peeking a fold). */
  forceOpen?: boolean;
  /** Turn the card over to the table: peel it open, then rotate it to face them. */
  showToTable?: boolean;
  /** Which card back design to print, from Settings. */
  variant?: CardBackVariant;
}

/**
 * The back of your own card, drawn once.
 *
 * Not the shared `CardBack`: that one strokes a rim round the printed area,
 * which the peel never showed, and swapping it in made your cards look lighter
 * than they always have.
 */
const PeelBack = React.memo(function PeelBack({ size, variant }: { size: number; variant?: CardBackVariant }) {
  const back = cardBackGeometry(size);
  const theme = cardBackTheme(variant);
  const h = back.h;
  const id = useId();
  return (
    <Svg width={size} height={h}>
      <Defs>
        <LinearGradient id={`${id}-back`} x1={0} y1={0} x2={size} y2={h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={theme.gradient[0]} />
          <Stop offset="0.5" stopColor={theme.gradient[1]} />
          <Stop offset="1" stopColor={theme.gradient[2]} />
        </LinearGradient>
        <ClipPath id={`${id}-card`}>
          <Rect x={back.print.x} y={back.print.y} width={back.print.w} height={back.print.h} rx={back.print.radius} />
        </ClipPath>
        <CardBackLattice id={`${id}-lattice`} size={size} color={theme.line} />
      </Defs>
      <Rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={h - 1}
        rx={back.radius}
        fill={colors.cardFace}
        stroke="#E2E8EE"
        strokeWidth={1}
      />
      <G clipPath={`url(#${id}-card)`}>
        <Rect x={0} y={0} width={size} height={h} fill={`url(#${id}-back)`} />
        <Rect x={0} y={0} width={size} height={h} fill={`url(#${id}-lattice)`} />
        <CardBackRosette size={size} color={theme.line} />
        <Rect
          x={back.panel.x}
          y={back.panel.y}
          width={back.panel.w}
          height={back.panel.h}
          rx={back.panel.radius}
          fill="none"
          stroke={theme.panel}
          strokeWidth={back.panel.stroke}
          strokeLinejoin="round"
        />
        <Circle
          cx={back.emblem.cx}
          cy={back.emblem.cy}
          r={back.emblem.r}
          fill={theme.emblemFill}
          stroke={theme.emblemStroke}
          strokeWidth={back.emblem.stroke}
        />
        <SvgText
          x={back.emblem.cx}
          y={back.emblem.baseline}
          fontSize={back.emblem.fontSize}
          fill={theme.mark}
          textAnchor="middle"
        >
          {theme.glyph}
        </SvgText>
      </G>
    </Svg>
  );
});

/**
 * Crease space to card space, as a 4x4 for a view's transform.
 *
 * x runs along the crease and y away from it into the paper still lying flat,
 * starting `offset` from the crease; `span` is how far x reaches either way.
 */
function creaseMatrix(c: Crease, offset: number, span: number): number[] {
  'worklet';
  const tx = -c.ny;
  const ty = c.nx;
  return [tx, ty, 0, 0, c.nx, c.ny, 0, 0, 0, 0, 1, 0,
    (c.d + offset) * c.nx - span * tx, (c.d + offset) * c.ny - span * ty, 0, 1];
}

/**
 * A hole card you lift to look at.
 *
 * The card is dealt face up, lays itself down after a beat, and from then on is
 * only readable while you physically peel it, which is how a real player
 * protects a hand, and means the default state is always hidden.
 *
 * The peel models what actually happens when you lift part of a card, and that
 * one decision settles everything else. The card bends back along a crease, so
 * the part still on the table never moves; the lifted piece turns over, so what
 * it shows is *its own face*, not more card back; and the gap it leaves behind
 * shows the table. That is why the value ends up printed on the peel itself.
 * It is also why the flap can never read as a second card lying on top: a
 * second card would be back-on-back, whereas a fold shows you the other side.
 *
 * Where the crease goes is decided by `peelFold` from where you grabbed and
 * where you dragged it, so a corner gives a dog-ear, an edge gives a lifted
 * strip, and a side folds inwards, all out of one drag. The version this
 * replaced could only ever fold one fixed corner, at 45°.
 *
 * The diagonal cut is a rotated view that clips its contents, see `crease`
 * below. `peelFold` owns the geometry and is unit-tested; this file is the
 * drawing and the feel.
 */
function PeekCardInner({
  rank,
  suit,
  size,
  peel,
  fromX = 0,
  fromY = -160,
  delay = 0,
  animate = true,
  showOnDealMs = 1400,
  forceOpen = false,
  showToTable = false,
  variant,
}: PeekCardProps) {
  const h = size * 1.42;
  const back = useMemo(() => cardBackGeometry(size), [size]);
  // Gradient ids share one namespace across the whole document, so each card
  // needs its own, and it must be *stable*. Deriving it from the card's size
  // looked like cheap insurance and was the opposite: the hole cards shrink
  // when the hand ends, the id changed with them, and for that frame the fills
  // referenced an id that no longer existed. react-native-svg does not leave an
  // unresolved paint unpainted; the card came out blank white.
  const gradId = useId();

  // Throw progress: 0 = in the dealer's hand, 1 = landed.
  const p = useSharedValue(animate ? 0 : 1);
  // 0 = face up, 1 = face down. A card that stops being face up has to turn
  // over; fading one side into the other reads as the card dissolving, and for
  // a moment you can see both faces at once through each other.
  const turn = useSharedValue(animate || forceOpen ? 0 : 1);
  // 1 = turned around to face the rest of the table.
  const flip = useSharedValue(0);

  const thrown = useRef(false);
  const spin = fromX >= 0 ? 12 : -12;

  useEffect(() => {
    if (!animate) {
      p.value = 1;
      thrown.current = true;
      return;
    }
    if (thrown.current) return;
    thrown.current = true;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: THROW_MS, easing: Easing.bezier(...easings.out) }));
  }, [animate, delay, p]);

  useEffect(() => {
    if (showToTable) {
      // The fold itself is driven by whoever owns the peel, because both cards
      // have to open together; this is only the card turning over afterwards.
      const afterPeel = PEEL_TIMING.open + PEEL_TIMING.hold + PEEL_TIMING.close;
      turn.value = withDelay(
        afterPeel,
        withTiming(0, { duration: PEEL_TIMING.flip, easing: Easing.bezier(...easings.inOut) }),
      );
      flip.value = withDelay(
        afterPeel,
        withTiming(1, { duration: PEEL_TIMING.flip, easing: Easing.bezier(...easings.inOut) }),
      );
      return;
    }
    flip.value = withTiming(0, { duration: motion.base });
    if (forceOpen) {
      turn.value = withTiming(0, { duration: PEEL_TIMING.flip, easing: Easing.bezier(...easings.inOut) });
      return;
    }
    if (!animate) {
      turn.value = 1;
      return;
    }
    // Dealt face up, then turned face down once you have had a moment to look.
    turn.value = 0;
    turn.value = withDelay(
      delay + THROW_MS + showOnDealMs,
      withTiming(1, { duration: PEEL_TIMING.flip, easing: Easing.bezier(...easings.inOut) }),
    );
  }, [forceOpen, showToTable, animate, delay, showOnDealMs, turn, flip]);

  /**
   * The fold, done by moving pictures rather than redrawing them.
   *
   * This used to redraw every shape of the card in SVG on every frame of a
   * peel, around twenty paths, gradients, clips and a tiled pattern per card,
   * on the CPU. Measured in the simulator that was about 40% of a core while a
   * finger was down, and it was the stutter you felt when anything else was
   * happening at the table.
   *
   * A fold is two pictures and a straight line. The part still on the table is
   * the card back cut along the crease; the lifted part is the card face,
   * swung over the crease, cut along the same line. Both pictures are drawn
   * once. The cut is a view whose edge lies on the crease and clips what is
   * inside it, and the swing is a transform, so a peel only moves layers the
   * GPU already holds.
   *
   * Every view below uses its top-left corner as the transform origin, so the
   * matrices read as plain card coordinates.
   */
  const crease = useDerivedValue(() =>
    creaseFor({ x: peel.anchorX.value, y: peel.anchorY.value }, peel.dirX.value, peel.dirY.value, peel.fold.value),
  );
  // Long enough that the clipping view always covers the whole card on its side
  // of the crease, wherever along it the card sits.
  const span = Math.ceil(Math.sqrt(size * size + h * h)) * 2;
  // Crease space to card space: x runs along the crease, y away from it into
  // the paper still lying flat. `offset` slides the band off the crease.
  const flatSide = useAnimatedStyle(() => ({ transform: [{ matrix: creaseMatrix(crease.value, 0, span) }] }));
  const shadeBand = useAnimatedStyle(() => ({ transform: [{ matrix: creaseMatrix(crease.value, -size * 0.3, span) }] }));
  // And back again, so what sits inside the clip is laid out on the card.
  const cardFrame = useAnimatedStyle(() => {
    const c = crease.value;
    return { transform: [{ matrix: [-c.ny, c.nx, 0, 0, c.nx, c.ny, 0, 0, 0, 0, 1, 0, span, -c.d, 0, 1] }] };
  });
  const shadeStyle = useAnimatedStyle(() => ({ opacity: peel.fold.value > 0 ? 1 : 0 }));
  // The lifted paper, swung over the bend. See reflectMatrix for why it is a
  // turn rather than a mirror.
  const flapStyle = useAnimatedStyle(() => {
    const lifted = peel.fold.value > 0;
    const m = reflectMatrix(crease.value, lifted, size);
    return {
      opacity: lifted ? 1 : 0,
      transform: [{ matrix: [m[0], m[1], 0, 0, m[2], m[3], 0, 0, 0, 0, 1, 0, m[4], m[5], 0, 1] }],
    };
  });
  // The bend catches the light along its whole length.
  const creaseWidth = Math.max(1, size * 0.022);
  const creaseLineStyle = useAnimatedStyle(() => {
    const seg = peel.fold.value > 1 ? creaseSegment(size, h, crease.value) : null;
    if (!seg) return { opacity: 0, width: 0 };
    const dx = seg[1].x - seg[0].x;
    const dy = seg[1].y - seg[0].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const half = creaseWidth / 2;
    return {
      opacity: 1,
      width: len,
      transform: [{ matrix: [ux, uy, 0, 0, -uy, ux, 0, 0, 0, 0, 1, 0, seg[0].x + half * uy, seg[0].y - half * ux, 0, 1] }],
    };
  });

  const throwStyle = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: Math.min(1, t * 5),
      transform: [
        { translateX: (1 - t) * fromX },
        { translateY: (1 - t) * fromY },
        { rotate: `${(1 - t) * spin}deg` },
        { scale: 0.78 + t * 0.22 },
      ],
    };
  });

  // Turning the card round for the table.
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${flip.value * 180}deg` }] }));

  // A card being read is held slightly off the table.
  const liftStyle = useAnimatedStyle(() => {
    const t = peel.limit.value > 0 ? Math.min(1, peel.fold.value / peel.limit.value) : 0;
    return { transform: [{ scale: 1 + t * 0.03 }, { translateY: -t * size * 0.04 }] };
  });

  // The turn itself. The two sides of a card are the same sheet 180° apart, so
  // each is given its own rotation exactly half a turn from the other, and each
  // is hidden for the half of the rotation in which it would be showing through
  // the back of the card. The swap happens at the edge-on moment, where there
  // is nothing to see anyway.
  //
  // They are siblings rather than the peel being nested inside the face's
  // rotation and counter-rotated by a further 180°. That nesting is what the
  // previous version did, and on device the two rotations did not cancel: the
  // whole peel, including the value printed on the flap, rendered mirrored.
  // It went unnoticed for so long because the only thing ever drawn on that
  // layer was the card back, whose every mark happens to be symmetric.
  const faceStyle = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${turn.value * 180}deg` }],
  }));
  const peelStyle = useAnimatedStyle(() => ({
    opacity: turn.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${(turn.value - 1) * 180}deg` }],
  }));


  return (
    <Animated.View style={[{ width: size, height: h }, throwStyle, flipStyle]}>
      <Animated.View style={[styles.layer, { width: size, height: h }, liftStyle]}>
        {/* Face up: the deal, the showdown, and the end of a turn. */}
        <Animated.View style={[styles.layer, { width: size, height: h }, faceStyle]}>
          <PlayingCard size={size} rank={rank} suit={suit} corners={4} />
        </Animated.View>

        <Animated.View style={[styles.layer, { width: size, height: h }, peelStyle]}>
          {/* The paper still on the table: the back, cut along the crease. */}
          <Animated.View style={[styles.pinned, { width: span * 2, height: span, overflow: 'hidden' }, flatSide]}>
            <Animated.View style={[styles.pinned, { width: size, height: h }, cardFrame]}>
              <PeelBack size={size} variant={variant} />
            </Animated.View>
          </Animated.View>
          {/* Shadow on the table, where the card no longer is. */}
          <Animated.View style={[styles.pinned, { width: size, height: h, overflow: 'hidden' }, shadeStyle]}>
            <Animated.View style={[styles.pinned, styles.shade, { width: span * 2, height: size * 0.3 }, shadeBand]} />
          </Animated.View>
          {/* The lifted piece, turned over, trimmed to the printed area. */}
          <View
            style={[styles.pinned, {
              left: back.print.x,
              top: back.print.y,
              width: back.print.w,
              height: back.print.h,
              borderRadius: back.print.radius,
              overflow: 'hidden',
            }]}
          >
            <View style={[styles.pinned, { left: -back.print.x, top: -back.print.y, width: size, height: h }]}>
              <Animated.View style={[styles.pinned, { width: span * 2, height: span, overflow: 'hidden' }, flatSide]}>
                <Animated.View style={[styles.pinned, { width: size, height: h }, cardFrame]}>
                  <Animated.View style={[styles.pinned, { width: size, height: h }, flapStyle]}>
                    <Svg width={size} height={h}>
                      <Defs>
                        {/* Card stock seen from the front and tilted toward the
                            light, so brightest furthest from the bend. */}
                        <LinearGradient id={`${gradId}-face`} x1={0} y1={0} x2={size} y2={h} gradientUnits="userSpaceOnUse">
                          <Stop offset="0" stopColor="#FFFFFF" />
                          <Stop offset="0.6" stopColor="#F4F7FA" />
                          <Stop offset="1" stopColor="#DFE6ED" />
                        </LinearGradient>
                      </Defs>
                      <Rect x={0} y={0} width={size} height={h} fill={`url(#${gradId}-face)`} />
                      <CardFaceContent rank={rank} suit={suit} size={size} paper={false} corners={4} />
                    </Svg>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
              <Animated.View
                style={[styles.pinned, styles.crease, { height: creaseWidth, borderRadius: creaseWidth / 2 }, creaseLineStyle]}
              />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Memoised, and load-bearing rather than an optimisation.
 *
 * The fold runs entirely on the UI thread, so a card being peeled does not need
 * React at all. But every ordinary re-render of the table, the turn timer
 * alone is one a second, would otherwise re-render this card, and each render
 * hands the group's current transform to react-native-svg's JavaScript parser,
 * which cannot read the only spelling the native side accepts. That logs an
 * error per render for as long as a finger is down. Every prop here is a
 * primitive or a stable shared-value holder, so there is nothing for a
 * re-render to usefully do anyway.
 */
export const PeekCard = React.memo(PeekCardInner);

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, borderRadius: radii.sm },
  pinned: { position: 'absolute', top: 0, left: 0, transformOrigin: [0, 0, 0] },
  shade: { backgroundColor: 'rgba(0,0,0,0.14)' },
  crease: { backgroundColor: 'rgba(255,255,255,0.7)' },
});
