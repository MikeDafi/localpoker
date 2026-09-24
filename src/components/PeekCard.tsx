import React, { useEffect, useId, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { CardFaceContent, PlayingCard } from './PlayingCard';
import { cardBackGeometry, cardBackTheme, type CardBackVariant } from './CardBack';
import { motion, easings, colors, radii } from '../theme/theme';
import type { Suit } from '../game/cardFace';
import type { Affine } from '../game/peelFold';
import {
  circlePoly,
  clipToFlat,
  creaseFor,
  creaseSegment,
  foldParts,
  foldShadow,
  pathFromPoly,
  reflectMatrix,
  roundRectPoly,
  sideOf,
} from '../game/peelFold';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);
/**
 * `matrix` is a real prop on the native group, `G.setNativeProps` looks for it
 * first and skips its transform parser when it finds it, but react-native-svg
 * only declares it on that method's signature, not on `GProps`. Widening the
 * type here is what lets the fold be driven by numbers instead of a string the
 * library cannot read back.
 */
type MatrixProp = { matrix?: Affine };
const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<React.ComponentProps<typeof G> & MatrixProp>,
);

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
 * RN cannot clip a view to a diagonal, so the whole card is drawn as SVG while
 * peeling. `peelFold` owns the geometry and is unit-tested; this file is the
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
  const backTheme = cardBackTheme(variant);
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
   * Everything the fold needs to draw, worked out once per frame.
   *
   * The shapes all derive from the same crease, so computing it separately
   * inside each animated prop would repeat the whole clip eight times a frame,
   * and, worse, would let the pieces disagree by a rounding error and show
   * hairline gaps along the bend.
   */
  const frame = useDerivedValue(() => {
    const c = creaseFor(
      { x: peel.anchorX.value, y: peel.anchorY.value },
      peel.dirX.value,
      peel.dirY.value,
      peel.fold.value,
    );
    const { flat, flap } = foldParts(size, h, c);
    const seg = creaseSegment(size, h, c);

    return {
      flat: pathFromPoly(flat),
      flap: pathFromPoly(flap),
      // The card's own face, folded. Everything printed on the part you lifted
      // rides up with it and lands mirrored about the bend.
      lifted: peel.fold.value > 0,
      mirror: reflectMatrix(c, peel.fold.value > 0, size),
      panel: pathFromPoly(
        clipToFlat(roundRectPoly(back.panel.x, back.panel.y, back.panel.w, back.panel.h, back.panel.radius), c),
      ),
      emblem: pathFromPoly(clipToFlat(circlePoly(back.emblem.cx, back.emblem.cy, back.emblem.r), c)),
      shade0: pathFromPoly(foldShadow(size, h, c, size * 0.3)),
      shade1: pathFromPoly(foldShadow(size, h, c, size * 0.18)),
      shade2: pathFromPoly(foldShadow(size, h, c, size * 0.08)),
      creaseX1: seg ? seg[0].x : 0,
      creaseY1: seg ? seg[0].y : 0,
      creaseX2: seg ? seg[1].x : 0,
      creaseY2: seg ? seg[1].y : 0,
      creaseOn: seg && peel.fold.value > 1 ? 1 : 0,
      // The back's suit mark is type, so it cannot be cut into pieces the way
      // the drawn shapes can. It fades over the window in which the crease
      // sweeps across it, which is close enough to ink disappearing round a
      // fold.
      markOpacity: Math.max(
        0,
        Math.min(1, sideOf({ x: back.emblem.cx, y: back.emblem.cy }, c) / back.emblem.r),
      ),
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

  const flatProps = useAnimatedProps(() => ({ d: frame.value.flat }));
  const flapProps = useAnimatedProps(() => ({ d: frame.value.flap }));
  const panelProps = useAnimatedProps(() => ({ d: frame.value.panel }));
  const emblemProps = useAnimatedProps(() => ({ d: frame.value.emblem }));
  const shade0 = useAnimatedProps(() => ({ d: frame.value.shade0 }));
  const shade1 = useAnimatedProps(() => ({ d: frame.value.shade1 }));
  const shade2 = useAnimatedProps(() => ({ d: frame.value.shade2 }));
  const creaseProps = useAnimatedProps(() => ({
    x1: frame.value.creaseX1,
    y1: frame.value.creaseY1,
    x2: frame.value.creaseX2,
    y2: frame.value.creaseY2,
    opacity: frame.value.creaseOn,
  }));
  const markProps = useAnimatedProps(() => ({ opacity: frame.value.markOpacity }));
  /**
   * The fold's transform, and nothing at all while nothing is folded.
   *
   * `matrix`, not `transform`, and that is the whole fix for a stream of parse
   * errors while peeling. react-native-svg animates a group through
   * `setNativeProps`, and `G`'s implementation runs its JavaScript transform
   * parser on every frame, which cannot read the only spelling the native side
   * accepts. Handed a `matrix` prop instead, it skips the parser entirely and
   * passes the six numbers straight through.
   *
   * Still omitted while nothing is lifted, so a card can mount without setting
   * it at all. Nothing is drawn through it then anyway, because the flap is
   * empty.
   */
  const mirrorProps = useAnimatedProps(() =>
    frame.value.lifted ? { matrix: frame.value.mirror } : {},
  );
  const clipProps = useAnimatedProps(() => ({ d: frame.value.flap }));

  return (
    <Animated.View style={[{ width: size, height: h }, throwStyle, flipStyle]}>
      <Animated.View style={[styles.layer, { width: size, height: h }, liftStyle]}>
        {/* Face up: the deal, the showdown, and the end of a turn. */}
        <Animated.View style={[styles.layer, { width: size, height: h }, faceStyle]}>
          <PlayingCard size={size} rank={rank} suit={suit} corners={4} />
        </Animated.View>

        <Animated.View style={[styles.layer, { width: size, height: h }, peelStyle]}>
          <Svg width={size} height={h}>
            <Defs>
              <LinearGradient
                id={`${gradId}-back`}
                x1={0}
                y1={0}
                x2={size}
                y2={h}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={backTheme.gradient[0]} />
                <Stop offset="0.5" stopColor={backTheme.gradient[1]} />
                <Stop offset="1" stopColor={backTheme.gradient[2]} />
              </LinearGradient>
              {/* The lifted piece is card stock seen from the front and tilted
                  toward the light, so it is paper-white and brightest furthest
                  from the bend. */}
              <LinearGradient
                id={`${gradId}-face`}
                x1={0}
                y1={0}
                x2={size}
                y2={h}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.6" stopColor="#F4F7FA" />
                <Stop offset="1" stopColor="#DFE6ED" />
              </LinearGradient>
              {/* The card's own outline. Every shape the fold draws is built
                  from a plain rectangle, a polygon has no notion of a rounded
                  corner, so without this the back of your own cards came out
                  square while the opponents', drawn straight from `CardBack`,
                  were rounded. */}
              <ClipPath id={`${gradId}-card`}>
                <Rect x={0} y={0} width={size} height={h} rx={back.radius} />
              </ClipPath>
              <ClipPath id={`${gradId}-flap`}>
                <AnimatedPath animatedProps={clipProps} />
              </ClipPath>
            </Defs>

            <G clipPath={`url(#${gradId}-card)`}>
            {/* The part still lying flat, with the back's printing cut by the
                same crease that cuts the card. */}
            <AnimatedPath
              animatedProps={flatProps}
              fill={`url(#${gradId}-back)`}
              stroke={backTheme.rim}
              strokeWidth={back.rim}
              strokeLinejoin="round"
            />
            <AnimatedPath
              animatedProps={panelProps}
              fill="none"
              stroke={backTheme.panel}
              strokeWidth={back.panel.stroke}
              strokeLinejoin="round"
            />
            <AnimatedPath
              animatedProps={emblemProps}
              fill={backTheme.emblemFill}
              stroke={backTheme.emblemStroke}
              strokeWidth={back.emblem.stroke}
            />
            <AnimatedSvgText
              animatedProps={markProps}
              x={back.emblem.cx}
              y={back.emblem.baseline}
              fontSize={back.emblem.fontSize}
              fill={backTheme.mark}
              textAnchor="middle"
            >
              {backTheme.glyph}
            </AnimatedSvgText>

            {/* Shadow on the table, where the card no longer is. */}
            <AnimatedPath animatedProps={shade0} fill="#000000" fillOpacity={0.1} />
            <AnimatedPath animatedProps={shade1} fill="#000000" fillOpacity={0.1} />
            <AnimatedPath animatedProps={shade2} fill="#000000" fillOpacity={0.1} />

            {/* The lifted piece, turned over. */}
            <AnimatedPath animatedProps={flapProps} fill={`url(#${gradId}-face)`} />
            {/* The card's own face, folded back over the bend and trimmed to
                the lifted paper. This is the whole point of modelling the peel
                as a fold: the pips, the index and the court figure all ride up
                on the corner you lifted, because they are printed on it. */}
            <G clipPath={`url(#${gradId}-flap)`}>
              <AnimatedG animatedProps={mirrorProps}>
                <CardFaceContent rank={rank} suit={suit} size={size} paper={false} corners={4} />
              </AnimatedG>
            </G>

            {/* The bend catches the light along its whole length. Drawn last, over
                the folded artwork, because the highlight is on the near edge of
                the paper and nothing printed on the card is in front of it. */}
            <AnimatedLine
              animatedProps={creaseProps}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth={Math.max(1, size * 0.022)}
              strokeLinecap="round"
            />

            </G>
          </Svg>
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
});
